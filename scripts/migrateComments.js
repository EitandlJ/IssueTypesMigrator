const axios = require('axios');
const marked = require('marked');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const env = require('../config/credentials'); // Importar las variables de entorno desde env.js

class JiraAzureMigrator {
  constructor() {
    const { AZURE_TOKEN, AZURE_ORG, AZURE_PROJECT, JIRA_EMAIL, JIRA_TOKEN } = env;

    if (!JIRA_EMAIL || !JIRA_TOKEN) {
      throw new Error('❌ Credenciales de Jira incompletas.');
    }

    if (!AZURE_TOKEN) {
      throw new Error('❌ Credenciales de Azure incompletas.');
    }

    this.jiraHeaders = {
      Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64')}`
    };

    this.azureHeaders = {
      Authorization: `Basic ${Buffer.from(`:${AZURE_TOKEN}`).toString('base64')}`
    };

    this.azureOrg = AZURE_ORG;
    this.azureProject = AZURE_PROJECT;

    // ✅ Crear carpeta temp si no existe
    this.tempDir = path.resolve(__dirname, 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async fetchCommentsFromJira(issueKey) {
    if (!issueKey) {
      console.log('❌ IssueKey inválido.');
      return [];
    }

    const url = `https://eitan-y-sus-enemigos.atlassian.net/rest/api/2/issue/${issueKey}/comment`;

    try {
      const response = await axios.get(url, { headers: this.jiraHeaders });
      const comments = response.data.comments || [];

      if (comments.length === 0) {
        console.log(`❌ No se encontraron comentarios para el issue ${issueKey}.`);
      } else {
        console.log(`✅ Comentarios recuperados para el issue ${issueKey}:`);
        comments.forEach((comment) => {
          console.log(`Autor: ${comment.author.displayName}`);
          console.log(`Comentario: ${comment.body}`);
          console.log(`Fecha de Creación: ${comment.created}`);
        });
      }

      return comments;
    } catch (error) {
      console.log(`❌ Error al obtener comentarios de Jira: ${error.message}`);
      return [];
    }
  }

  async fetchAttachmentsFromJira(issueKey) {
    if (!issueKey) return [];

    const url = `https://eitan-y-sus-enemigos.atlassian.net/rest/api/2/issue/${issueKey}`;
    try {
      const response = await axios.get(url, { headers: this.jiraHeaders });
      const attachments = response.data.fields.attachment || [];
      return attachments;
    } catch (error) {
      console.log(`❌ Error al obtener adjuntos de Jira: ${error.message}`);
      return [];
    }
  }

  async downloadImage(url, fileName) {
    const sanitizeFileName = (fileName) => {
      return fileName.replace(/[^a-zA-Z0-9.]/g, '_'); // Sanitizar el nombre del archivo
    };

    const safeFileName = sanitizeFileName(fileName);
    const filePath = path.join(this.tempDir, safeFileName);
    const pngPath = path.join(this.tempDir, `${path.parse(safeFileName).name}.png`);

    // Verificar si el archivo ya existe en la carpeta temp
    if (fs.existsSync(pngPath)) {
      console.log(`✅ El archivo ${pngPath} ya existe, se utilizará el existente.`);
      return pngPath;
    }

    console.log(`📥 Descargando imagen desde: ${url}`);
    const writer = fs.createWriteStream(filePath);

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: this.jiraHeaders,
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          console.log(`✅ Imagen guardada en: ${filePath}`);
          try {
            // 🔄 Convertir a PNG usando sharp
            await sharp(filePath)
              .toFormat('png')
              .toFile(pngPath);

            console.log(`✅ Imagen convertida a PNG en: ${pngPath}`);

            // Intentar eliminar la imagen original después de la conversión
            try {
              fs.unlinkSync(filePath);
              console.log(`✅ Imagen original eliminada: ${filePath}`);
            } catch (unlinkError) {
              console.log(`⚠️ No se pudo eliminar la imagen original: ${unlinkError.message}`);
            }

            resolve(pngPath);
          } catch (err) {
            console.log(`❌ Error al convertir a PNG: ${err.message}`);
            // Intentar eliminar el archivo temporal en caso de error
            try {
              fs.unlinkSync(filePath);
              console.log(`✅ Archivo temporal eliminado: ${filePath}`);
            } catch (unlinkError) {
              console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
            }
            reject(err);
          }
        });

        writer.on('error', (err) => {
          console.log(`❌ Error al descargar imagen: ${err.message}`);
          // Intentar eliminar el archivo temporal en caso de error
          try {
            fs.unlinkSync(filePath);
            console.log(`✅ Archivo temporal eliminado: ${filePath}`);
          } catch (unlinkError) {
            console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
          }
          reject(err);
        });
      });
    } catch (error) {
      console.log(`❌ Error al iniciar la descarga de la imagen: ${error.message}`);
      // Intentar eliminar el archivo temporal en caso de error
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Archivo temporal eliminado: ${filePath}`);
      } catch (unlinkError) {
        console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
      }
      throw error;
    }
  }

  async attachImageToWorkItem(workItemId, filePath) {
    const fileName = path.basename(filePath).replace(/\.[^/.]+$/, '.png');
    const url = `https://dev.azure.com/${this.azureOrg}/${this.azureProject}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=7.1-preview.3`;

    try {
      console.log(`📤 Subiendo archivo: ${filePath} a ${url}`);

      const fileData = fs.readFileSync(filePath);

      const response = await axios.post(url, fileData, {
        headers: {
          ...this.azureHeaders,
          'Content-Type': 'application/octet-stream',
        },
      });

      console.log('🔎 Respuesta completa de Azure DevOps:', response.data);

      const attachmentUrl = response.data?.url || response.data._links?.self?.href;
      if (!attachmentUrl) {
        throw new Error('No se encontró la URL del adjunto en la respuesta.');
      }

      console.log(`✅ Imagen subida correctamente. URL: ${attachmentUrl}`);

      // 👉 Asociar el archivo como adjunto al Work Item
      await axios.patch(
        `https://dev.azure.com/${this.azureOrg}/${this.azureProject}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`,
        [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'AttachedFile',
              url: attachmentUrl,
            },
          },
        ],
        {
          headers: {
            ...this.azureHeaders,
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      console.log(`✅ Imagen adjuntada correctamente al Work Item ${workItemId}`);

      // 👉 Retornar la URL para que pueda usarse en el comentario
      return attachmentUrl;

    } catch (error) {
      console.error(`❌ Error al adjuntar imagen: ${JSON.stringify(error.response?.data || error.message)}`);
      // Intentar eliminar el archivo temporal en caso de error
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Archivo temporal eliminado: ${filePath}`);
      } catch (unlinkError) {
        console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
      }
      throw error; // Importante para que el flujo de control reconozca el error
    }
  }

  async downloadVideo(url, fileName) {
    const sanitizeFileName = (fileName) => {
      return fileName.replace(/[^a-zA-Z0-9.]/g, '_'); // Sanitizar el nombre del archivo
    };

    const safeFileName = sanitizeFileName(fileName);
    const filePath = path.join(this.tempDir, safeFileName);

    // Verificar si el archivo ya existe en la carpeta temp
    if (fs.existsSync(filePath)) {
      console.log(`✅ El archivo ${filePath} ya existe, se utilizará el existente.`);
      return filePath;
    }

    console.log(`📥 Descargando video desde: ${url}`);
    const writer = fs.createWriteStream(filePath);

    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: this.jiraHeaders,
      });

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`✅ Video guardado en: ${filePath}`);
          resolve(filePath);
        });

        writer.on('error', (err) => {
          console.log(`❌ Error al descargar video: ${err.message}`);
          // Intentar eliminar el archivo temporal en caso de error
          try {
            fs.unlinkSync(filePath);
            console.log(`✅ Archivo temporal eliminado: ${filePath}`);
          } catch (unlinkError) {
            console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
          }
          reject(err);
        });
      });
    } catch (error) {
      console.log(`❌ Error al iniciar la descarga del video: ${error.message}`);
      // Intentar eliminar el archivo temporal en caso de error
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Archivo temporal eliminado: ${filePath}`);
      } catch (unlinkError) {
        console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
      }
      throw error;
    }
  }

  async attachVideoToWorkItem(workItemId, filePath) {
    const fileName = path.basename(filePath);
    const url = `https://dev.azure.com/${this.azureOrg}/${this.azureProject}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=7.1-preview.3`;

    try {
      console.log(`📤 Subiendo archivo de video: ${filePath} a ${url}`);

      const fileData = fs.readFileSync(filePath);

      const response = await axios.post(url, fileData, {
        headers: {
          ...this.azureHeaders,
          'Content-Type': 'application/octet-stream',
        },
      });

      const attachmentUrl = response.data?.url || response.data._links?.self?.href;
      if (!attachmentUrl) {
        throw new Error('No se encontró la URL del adjunto en la respuesta.');
      }

      console.log(`✅ Video subido correctamente. URL: ${attachmentUrl}`);

      // 👉 Asociar el archivo como adjunto al Work Item
      await axios.patch(
        `https://dev.azure.com/${this.azureOrg}/${this.azureProject}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`,
        [
          {
            op: 'add',
            path: '/relations/-',
            value: {
              rel: 'AttachedFile',
              url: attachmentUrl,
            },
          },
        ],
        {
          headers: {
            ...this.azureHeaders,
            'Content-Type': 'application/json-patch+json',
          },
        }
      );

      console.log(`✅ Video adjuntado correctamente al Work Item ${workItemId}`);

      // 👉 Retornar la URL para incluir en el comentario
      return attachmentUrl;
    } catch (error) {
      console.error(`❌ Error al adjuntar video: ${JSON.stringify(error.response?.data || error.message)}`);
      // Intentar eliminar el archivo temporal en caso de error
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Archivo temporal eliminado: ${filePath}`);
      } catch (unlinkError) {
        console.log(`⚠️ No se pudo eliminar el archivo temporal: ${unlinkError.message}`);
      }
      throw error;
    }
  }

  convertJiraMarkupToHtml(body) {
    if (!body) return '';

    // ✅ Convertir encabezados de Jira a Markdown
    body = body.replace(/^h1\.\s*(.*)/gm, '# $1');
    body = body.replace(/^h2\.\s*(.*)/gm, '## $1');
    body = body.replace(/^h3\.\s*(.*)/gm, '### $1');
    body = body.replace(/^h4\.\s*(.*)/gm, '#### $1');
    body = body.replace(/^h5\.\s*(.*)/gm, '##### $1');
    body = body.replace(/^h6\.\s*(.*)/gm, '###### $1');

    // ✅ Convertir texto enriquecido
    body = body.replace(/\+(.*?)\+/g, '<u>$1</u>');
    body = body.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    body = body.replace(/_(.*?)_/g, '<em>$1</em>');
    body = body.replace(/~(.*?)~/g, '<del>$1</del>');

    // ✅ Convertir colores de Jira a HTML
    body = body.replace(/{color:#([0-9a-fA-F]+)}(.*?){color}/g, '<span style="color:#$1">$2</span>');

    // ✅ Insertar imágenes en HTML directamente
    body = body.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%; height:auto;">');

    // 🆕 ✅ Convertir enlaces Jira `[texto|link]` a HTML `<a>` 
    body = body.replace(/\[(.*?)\|(https?:\/\/[^\s\]]+)\]/g, '<a href="$2" target="_blank">$1</a>');

    // 🆕 ✅ Convertir `{{texto}}` a etiquetas `<code>`
    body = body.replace(/{{(.*?)}}/g, '<code>$1</code>');

    // 🆕 ✅ Convertir listas enumeradas
    body = body.replace(/(?:^|\n)# (.*?)(?=\n|$)/g, (match, item) => {
      return `<li>${item}</li>`;
    });

    // ✅ Encerrar automáticamente en `<ol>` si hay elementos de lista
    if (body.includes('<li>')) {
      body = `<ol>${body}</ol>`;
    }

    // ✅ Convertir tablas de Jira a HTML
    body = body.replace(
      /\|\|(.*?)\|\|\n([\s\S]*?)(?=\n*$)/g,
      (_, headers, rows) => {
        const headerHtml = headers
          .split('||')
          .map(header => `<th>${header.replace(/\*/g, '').trim()}</th>`)
          .join('');

        const rowHtml = rows
          .trim()
          .split('\n')
          .map(row => {
            const cells = row
              .split('|')
              .filter(cell => cell.trim() !== '')
              .map(cell => `<td>${cell.trim()}</td>`)
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

        return `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; text-align: center;">` +
               `<thead><tr>${headerHtml}</tr></thead>` +
               `<tbody>${rowHtml}</tbody>` +
               `</table>`;
      }
    );

    // 🆕 ✅ Convertir enlaces de video de Jira `!video.mp4|width=576,height=416!` a un enlace HTML <a>
    body = body.replace(/!(.*?)\|(.*?)?!/g, (match, filename, attributes) => {
      const videoExt = filename.split('.').pop().toLowerCase();
      if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(videoExt)) {
        return `<a href="${filename}" target="_blank">Ver video: ${filename}</a>`;
      }
      return match; // Return the original if not a video
    });

    return marked.parse(body);
  }

  async addCommentToWorkItem(workItemId, comment) {
    if (!workItemId) {
      console.log('❌ ID de Work Item inválido.');
      return;
    }

    const url = `https://dev.azure.com/${this.azureOrg}/${this.azureProject}/_apis/wit/workitems/${workItemId}?api-version=7.1-preview.3`;

    const body = [
      {
        op: 'add',
        path: '/fields/System.History',
        value: comment,
      },
    ];

    try {
      await axios.patch(url, body, {
        headers: {
          ...this.azureHeaders,
          'Content-Type': 'application/json-patch+json',
        },
      });
      console.log(`✅ Comentario agregado correctamente al Work Item ${workItemId}`);
    } catch (error) {
      console.log(`❌ Error al agregar comentario: ${error.message}`);
    }
  }

  async migrateCommentsAndAttachments(workItemId, issueKey) {
    const comments = await this.fetchCommentsFromJira(issueKey);
    const attachments = await this.fetchAttachmentsFromJira(issueKey);
    const processedFiles = new Map();

    for (const comment of comments) {
      const createdDate = comment.created;
      const author = comment.author.displayName;

      let body = this.convertJiraMarkupToHtml(comment.body);

      for (const attachment of attachments) {
        const fileExtension = attachment.filename.split('.').pop().toLowerCase();

        if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(fileExtension)) {
          if (!processedFiles.has(attachment.filename)) {
            try {
              const videoPath = await this.downloadVideo(attachment.content, attachment.filename);
              const videoUrl = await this.attachVideoToWorkItem(workItemId, videoPath);

              processedFiles.set(attachment.filename, videoUrl);
            } catch (error) {
              console.log(`❌ Error al procesar video adjunto: ${attachment.filename}: ${error.message}`);
            }
          }
        } else if (fileExtension !== 'jif' && !processedFiles.has(attachment.filename)) {
          try {
            console.log(`⬇️ Descargando archivo: ${attachment.filename}`);
            const filePath = await this.downloadImage(attachment.content, attachment.filename);

            // 👉 Marcar el archivo como procesado **antes** de subirlo
            processedFiles.set(attachment.filename, null);

            const attachmentUrl = await this.attachImageToWorkItem(workItemId, filePath);
            console.log(`✅ URL de imagen subida: ${attachmentUrl}`);

            // Actualizar el Map con la URL
            processedFiles.set(attachment.filename, attachmentUrl);

            // 👉 Simplificar el patrón para que coincida aunque no tenga width/height
            const jiraImagePattern = new RegExp(`!${attachment.filename}(\\|.*)?!`, 'g');
            body = body.replace(jiraImagePattern, `<img src="${attachmentUrl}" alt="${attachment.filename}" style="max-width:100%; height:auto;">`);
          } catch (error) {
            console.log(`❌ Error al procesar adjunto: ${attachment.filename}: ${error.message}`);
          }
        }

        // ✅ Si el archivo ya fue procesado, reutiliza la URL
        if (processedFiles.has(attachment.filename)) {
          console.log(`🔁 El archivo ${attachment.filename} ya fue procesado, reutilizando URL...`);
          const attachmentUrl = processedFiles.get(attachment.filename);

          // Reemplazar la referencia en el comentario
          const jiraImagePattern = new RegExp(`!${attachment.filename}(\\|.*)?!`, 'g');
          body = body.replace(jiraImagePattern, `<img src="${attachmentUrl}" alt="${attachment.filename}" style="max-width:100%; height:auto;">`);
          continue;
        }
      }

      // 🔗 Crear el comentario final en formato HTML
      const commentText = ` 
        <strong>${author} (${createdDate}):</strong><br>
        ${body}
      `;

      console.log("Comentario HTML generado:", commentText);

      // ✅ Agregar el comentario al Work Item
      await this.addCommentToWorkItem(workItemId, commentText);
    }
  }
}

module.exports = JiraAzureMigrator;