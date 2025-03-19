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
    "duedate": "Microsoft.VSTS.Scheduling.DueDate"
};

// Mapeo de prioridad de Jira a valores numéricos en Azure DevOps
const priorityMapping = {
    "Highest": 1,
    "High": 2,
    "Medium": 3,
    "Low": 4,
    "Lowest": 5
};

// Función para extraer valores anidados de un objeto
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : null, obj);
}

// Función para convertir un issue de Jira a formato Azure DevOps
function convertJiraToAzure(jiraIssue) {
    let azureFields = {};

    for (const jiraField in jiraIssue.fields) {
        let value = getNestedValue(jiraIssue.fields, jiraField);
        
        if (jiraField === "labels" && Array.isArray(value)) {
            value = value.join("; ");
        }

        // Convertir prioridad a número
        if (jiraField === "priority" && value && typeof value === "object") {
            value = priorityMapping[value.name] || 3; // Si no coincide, asignar prioridad 3 (Medium)
        }

        // Verificar si System.AreaPath tiene un valor válido
        if (jiraField === "components" && (value === null || value.length === 0)) {
            value = ["\\ProjectName\\AreaPath"]; // Asigna un valor por defecto
        }

        // Manejo de custom fields
        if (jiraField.startsWith("customfield_")) {
            const fieldName = value && value.name ? value.name : "UnknownField";
            const referenceName = `Custom.${jiraField.replace("customfield_", "")}.${fieldName.replace(/\s/g, "")}`;

            // Si value es null o undefined, asignar un valor predeterminado
            azureFields[referenceName] = value && value.value !== null ? value.value : "";
        } else if (fieldMapping[jiraField] && value !== null) {
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

