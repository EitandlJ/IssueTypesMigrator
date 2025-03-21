const fs = require("fs");
const path = require("path");
const { convertJiraToAzure } = require("./scripts/convert");
const { createWorkItemTypes, createWorkItem, fetchProcessId  } = require("./scripts/migrateIssues");
const migrateCustomFields = require("./scripts/migrateCustomFields");
const JiraAzureMigrator = require("./scripts/migrateComments");

const ISSUES_FOLDER = "issues_json"; // Carpeta donde están los JSON

// Objeto para almacenar el mapeo entre el Key de Jira y los Work Item IDs de Azure DevOps
const jiraKeyToAzureIdMap = {};



(async () => {
    try {
        console.log("🚀 Iniciando migración...");
        // 1️⃣ Obtener el Process ID del proyecto
        console.log("🔄 Obteniendo Process ID del proyecto...");
        const processId = await fetchProcessId();
        console.log(`✅ Process ID obtenido: ${processId}`);

        // 2️⃣ Crear los Work Item Types personalizados usando el ID del proceso heredado
        console.log("🔄 Creando Work Item Types personalizados...");
        await createWorkItemTypes(processId);
        console.log("✅ Work Item Types creados exitosamente.");
        // 3 Migrar primero los custom fields
        console.log("🔄 Migrando Custom Fields...");
        await migrateCustomFields();
        console.log("✅ Custom Fields migrados exitosamente.\n");

        // 4 Leer todos los archivos JSON en la carpeta 'issues_json'
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

                // 5 Mapeo de nombres de Issue Types en español e inglés a Azure DevOps
                const issueTypeMapping = {
                    "Bug": "Bug1",
                    "Epic": "Epic1",
                    "Feature": "Feature1",
                    "Impediment": "Impediment1",
                    "Product Backlog Item": "ProductBacklogItem1",
                    "Task": "Task1",
                    "Test Case": "TestCase1",
                    "Test Plan": "TestPlan1",
                    "Test Suite": "TestSuite1"
                };

                // 6 Extraer tipo de issue y convertirlo al formato esperado en Azure DevOps
                let issueType = jiraIssue.fields?.issuetype?.name || "Issue";
                issueType = issueTypeMapping[issueType] || "Task1";


                console.log(`🛠️ Migrando Issue Type: ${issueType}...\n`);

                // 7 Convertir el issue de Jira al formato de Azure DevOps
                const azureWorkItem = convertJiraToAzure(jiraIssue);

                // 8 Crear el Work Item en Azure DevOps con su tipo corregido
                const workItemId = await createWorkItem(azureWorkItem, issueType);

                if (!workItemId) {
                    console.log("❌ No se pudo obtener el ID del Work Item creado.");
                    continue; // Saltar a la siguiente iteración si no se pudo crear el Work Item
                }

                console.log(`🛠️ Work Item creado con ID: ${workItemId}`);

                // 9 Almacenar el mapeo entre el Key de Jira y el Work Item ID de Azure DevOps
                if (!jiraKeyToAzureIdMap[jiraIssue.key]) {
                    jiraKeyToAzureIdMap[jiraIssue.key] = []; // Inicializar un array si no existe
                }
                jiraKeyToAzureIdMap[jiraIssue.key].push(workItemId); // Agregar el ID al array

                // 10 Migrar comentarios y adjuntos después de crear el Work Item
                const migrator = new JiraAzureMigrator(); // Instanciar sin argumentos

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
