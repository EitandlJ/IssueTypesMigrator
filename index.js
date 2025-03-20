const fs = require("fs");
const { convertJiraToAzure } = require("./scripts/convert");
const { createWorkItem } = require("./scripts/migrateIssues");
const migrateCustomFields = require("./scripts/migrateCustomFields");


(async () => {
    try {
        console.log("🚀 Iniciando migración...");

        // 1️⃣ Migrar primero los custom fields
        console.log("🔄 Migrando Custom Fields...");
        await migrateCustomFields();
        console.log("✅ Custom Fields migrados exitosamente.\n");

        // 2️⃣ Leer el JSON de Jira
        console.log("📂 Cargando sample_issue.json...");
        const rawData = fs.readFileSync("sample_issue.json");
        const jiraIssue = JSON.parse(rawData);

        // 3️⃣ Mapeo de nombres de Issue Types en español e inglés a Azure DevOps
        const issueTypeMapping = {
            "Error": "Bug",
            "Bug": "Bug",
            "Historia": "User Story",
            "Story": "User Story",
            "Épica": "Epic",
            "Epic": "Epic",
            "Tarea": "Task",
            "Task": "Task",
            "Incidencia": "Issue",
            "Issue": "Issue"
        };

        // 4️⃣ Extraer tipo de issue y convertirlo al formato esperado en Azure DevOps
        let issueType = jiraIssue.fields.issuetype.name || "Issue";
        issueType = issueTypeMapping[issueType] || issueType;

        console.log(`🛠️ Migrando Issue Type: ${issueType}...\n`);

        // 5️⃣ Convertir el issue de Jira al formato de Azure DevOps
        const azureWorkItem = convertJiraToAzure(jiraIssue);

        // 6️⃣ Crear el Work Item en Azure DevOps con su tipo corregido
        await createWorkItem(azureWorkItem, issueType);

        console.log("✅ Migración completada exitosamente.");

    } catch (error) {
        console.error("❌ Error en la migración:", error.message);
    }
})();
