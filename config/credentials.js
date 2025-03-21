require("dotenv").config();

module.exports = {
  AZURE_ORG: process.env.AZURE_ORG,
  AZURE_PROJECT: process.env.AZURE_PROJECT,
  AZURE_TOKEN: process.env.AZURE_TOKEN,
  JIRA_EMAIL: process.env.JIRA_EMAIL,
  JIRA_TOKEN: process.env.JIRA_TOKEN
};