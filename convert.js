const fs = require("fs");

// Definir el mapeo de campos de Jira a Azure DevOps
const fieldMapping = {
    "summary": "System.Title",
    "description": "System.Description",
   
    "created": "System.CreatedDate",
    "updated": "System.ChangedDate",
    
    "creator.displayName": "System.CreatedBy",
    "labels": "System.Tags",
    "priority": "Microsoft.VSTS.Common.Priority",
    "duedate": "Microsoft.VSTS.Scheduling.DueDate",
    "customfield_10016": "Microsoft.VSTS.Scheduling.StoryPoints",
    "customfield_10014": "System.Parent"
};

// Mapeo de prioridad de Jira a valores numéricos en Azure DevOps
const priorityMapping = {
    "Highest": 1,
    "High": 2,
    "Medium": 3,
    "Low": 4,
    "Lowest": 5
};

// Mapeo de estado de Jira a valores válidos en Azure DevOps usando el ID del estado
const stateMapping = {
    "To Do": "9a06c842-44ed-4197-93d1-94eaeb172db7", // ID para 'New'
    "In Progress": "70bef09f-f31f-4319-ac2a-49c2c2563dd4", // ID para 'Active'
    "Completed": "373d83a9-ff8c-4701-a907-f288f0d604e7", // ID para 'Closed'
    "Closed": "373d83a9-ff8c-4701-a907-f288f0d604e7", // ID para 'Closed'
    "Removed": "Removed" // Si Jira tiene 'Removed' como estado
};

// Función para extraer valores anidados de un objeto
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : null, obj);
}

// Función para convertir un issue de Jira a formato Azure DevOps
function convertJiraToAzure(jiraIssue) {
    let azureFields = {};

    for (const jiraField in fieldMapping) {
        let value = getNestedValue(jiraIssue.fields, jiraField);
        
        if (jiraField === "labels" && Array.isArray(value)) {
            value = value.join("; ");
        }

        // Mapeo de estado: asegúrate de que el valor de estado sea válido
        if (jiraField === "status.name" && stateMapping[value]) {
            value = stateMapping[value]; // Mapea el estado al valor de Azure DevOps (ID específico)
        }

        // Convertir prioridad a número
        if (jiraField === "priority" && value && typeof value === "object") {
            value = priorityMapping[value.name] || 3; // Si no coincide, asignar prioridad 3 (Medium)
        }

        // Story Points y Parent deben ser valores directos
        if (jiraField === "customfield_10016" && value && typeof value === "object") {
            value = value.value || null;
        }

        if (jiraField === "customfield_10014" && value && typeof value === "object") {
            value = value.value || null;
        }

        // Verificar si System.AreaPath tiene un valor válido
        if (jiraField === "components" && (value === null || value.length === 0)) {
            value = ["\\ProjectName\\AreaPath"]; // Asigna un valor por defecto
        }

        if (value !== null) {
            azureFields[fieldMapping[jiraField]] = value;
        }
    }

    return { fields: azureFields };
}

// Leer el archivo de prueba y convertirlo
function testConversion() {
    const rawData = fs.readFileSync("sample_issue.json");
    const jiraIssue = JSON.parse(rawData);
    const azureWorkItem = convertJiraToAzure(jiraIssue);

    console.log("JSON Convertido:", JSON.stringify(azureWorkItem, null, 2));
}

// Exportar la función
module.exports = { convertJiraToAzure };

// Prueba la conversión con un JSON de prueba
testConversion();
