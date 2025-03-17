const fs = require("fs");
const { convertJiraToAzure } = require("./convert");
const { createWorkItem } = require("./createWorkItem");

// Leer el JSON de Jira
const rawData = fs.readFileSync("sample_issue.json");
const jiraIssue = JSON.parse(rawData);

// Convertir a formato Azure DevOps
const azureWorkItem = convertJiraToAzure(jiraIssue);

// Crear el Work Item en Azure DevOps
createWorkItem(azureWorkItem);
