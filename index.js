const fs = require("fs");
const { convertJiraToAzure } = require("./convert");
const { createWorkItem } = require("./createWorkItem");

// Mapeo de nombres de Issue Types en español e inglés a los nombres esperados en Azure DevOps
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

// Leer el JSON de Jira
const rawData = fs.readFileSync("sample_issue.json");
const jiraIssue = JSON.parse(rawData);

// Extraer tipo de issue y convertirlo a la nomenclatura esperada en Azure DevOps
let issueType = jiraIssue.fields.issuetype.name || "Issue";
issueType = issueTypeMapping[issueType] || issueType; // Convertir si está en el mapeo

// Convertir a formato Azure DevOps
const azureWorkItem = convertJiraToAzure(jiraIssue);

// Crear el Work Item en Azure DevOps con su tipo corregido
createWorkItem(azureWorkItem, issueType);
