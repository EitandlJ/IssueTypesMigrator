const fs = require("fs");
const path = require("path");
const { convertJiraToAzure } = require("./scripts/convert");
const { createWorkItem } = require("./scripts/migrateIssues");
const migrateCustomFields = require("./scripts/migrateCustomFields");
const JiraAzureMigrator = require("./scripts/migrateComments");

const ISSUES_FOLDER = "issues_json"; // Carpeta donde están los JSON

// Objeto para almacenar el mapeo entre el Key de Jira y los Work Item IDs de Azure DevOps
const jiraKeyToAzureIdMap = {};

(async () => {
    try {
        console.log("🚀 Iniciando migración...");

        // 1️⃣ Migrar primero los custom fields
        console.log("🔄 Migrando Custom Fields...");
        await migrateCustomFields();
        console.log("✅ Custom Fields migrados exitosamente.\n");

        // 2️⃣ Leer todos los archivos JSON en la carpeta 'issues_json'
        const issueFiles = fs.readdirSync(ISSUES_FOLDER).filter(file => file.endsWith(".json"));

        if (issueFiles.length === 0) {
            console.log("⚠️ No se encontraron archivos JSON en la carpeta issues_json.");
            return;
        }

        for (const file of issueFiles) {
            try {
                const filePath = path.join(ISSUES_FOLDER, file);
                console.log(`📂 Procesando archivo: ${file}`);

                const rawData = fs.readFileSync(filePath, "utf8");
                const jiraIssue = JSON.parse(rawData);

                // 3️⃣ Mapeo de nombres de Issue Types en español e inglés a Azure DevOps
                const issueTypeMapping = {
                    "Error": "Bug", "Bug": "Bug",
                    "Historia": "User Story", "Story": "User Story",
                    "Épica": "Epic", "Epic": "Epic",
                    "Tarea": "Task", "Task": "Task",
                    "Incidencia": "Issue", "Issue": "Issue"
                };

                // 4️⃣ Extraer tipo de issue y convertirlo al formato esperado en Azure DevOps
                let issueType = jiraIssue.fields?.issuetype?.name || "Issue";
                issueType = issueTypeMapping[issueType] || issueType;

                console.log(`🛠️ Migrando Issue Type: ${issueType}...\n`);

                // 5️⃣ Convertir el issue de Jira al formato de Azure DevOps
                const azureWorkItem = convertJiraToAzure(jiraIssue);

                // 6️⃣ Crear el Work Item en Azure DevOps con su tipo corregido
                const workItemId = await createWorkItem(azureWorkItem, issueType);

                if (!workItemId) {
                    console.log("❌ No se pudo obtener el ID del Work Item creado.");
                    continue; // Saltar a la siguiente iteración si no se pudo crear el Work Item
                }

                console.log(`🛠️ Work Item creado con ID: ${workItemId}`);

                // 7️⃣ Almacenar el mapeo entre el Key de Jira y el Work Item ID de Azure DevOps
                if (!jiraKeyToAzureIdMap[jiraIssue.key]) {
                    jiraKeyToAzureIdMap[jiraIssue.key] = []; // Inicializar un array si no existe
                }
                jiraKeyToAzureIdMap[jiraIssue.key].push(workItemId); // Agregar el ID al array

                // 8️⃣ Migrar comentarios y adjuntos después de crear el Work Item
                const migrator = new JiraAzureMigrator(
                    process.env.AZURE_TOKEN,
                    process.env.AZURE_ORG,
                    process.env.AZURE_PROJECT,
                    process.env.JIRA_EMAIL,
                    process.env.JIRA_TOKEN
                );

                await migrator.migrateCommentsAndAttachments(workItemId, jiraIssue.key);

            } catch (error) {
                console.error(`❌ Error procesando ${file}:`, error.message);
            }
        }

        console.log("✅ Migración completada exitosamente.");
        console.log("🔍 Mapeo de Key de Jira a Work Item IDs de Azure DevOps:", jiraKeyToAzureIdMap);

    } catch (error) {
        console.error("❌ Error en la migración:", error.message);
    }
})();
