const axios = require("axios");
const env = require("../config/env"); // Importamos las variables de entorno desde env.js

// Función para normalizar el nombre del issue type manteniendo espacios
function normalizeIssueType(issueType) {
    return issueType
        .toLowerCase() // Convertir a minúsculas
        .split(" ") // Dividir en palabras
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalizar cada palabra
        .join(" "); // Volver a unir con espacio
}

// Función para crear un Work Item en Azure DevOps
async function createWorkItem(workItemData, issueType) {
    const { AZURE_ORG, AZURE_PROJECT, AZURE_TOKEN } = env; // Usamos las variables desde env.js
    
    // Normalizar issueType correctamente
    const normalizedIssueType = normalizeIssueType(issueType);
    
    // Construcción dinámica de la URL (reemplazar espacios por %20 para URL)
    const apiUrl = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/workitems/$${encodeURIComponent(normalizedIssueType)}?api-version=7.1-preview.3`;

    const payload = Object.entries(workItemData.fields).map(([key, value]) => ({
        op: "add",
        path: `/fields/${key}`,
        value: value
    }));

    try {
        const response = await axios.patch(apiUrl, payload, {
            headers: {
                "Content-Type": "application/json-patch+json",
                "Authorization": `Basic ${Buffer.from(":" + AZURE_TOKEN).toString("base64")}`
            }
        });

        console.log("✅ Work Item Creado:", response.data.id);
    } catch (error) {
        console.error("❌ Error al crear Work Item:", error.response ? error.response.data : error.message);
    }
}

// Exportar la función
module.exports = { createWorkItem };
