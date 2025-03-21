// finalWorkflowMigrator.js

require("dotenv").config();
const { AZURE_ORG, AZURE_PROJECT, AZURE_TOKEN } = require("../config/env");

console.log("🔍 Variables de entorno cargadas:", AZURE_ORG, AZURE_PROJECT, AZURE_TOKEN);

const axios = require("axios");

class WorkflowMigrator {
  static CATEGORY_MAPPING = {
    "To Do": { color: "b2b2b2", stateCategory: "Proposed" },
    "In Progress": { color: "007acc", stateCategory: "InProgress" },
    "Done": { color: "00cc66", stateCategory: "Resolved" }
  };

  constructor(organization, projectName, customTaskId, personalAccessToken) {
    const patEncoded = Buffer.from(`:${personalAccessToken}`).toString("base64");
    this.azureHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Basic ${patEncoded}`
    };

    this.organization = organization;
    this.projectName = projectName;
    this.processId = null;
    this.customTaskId = customTaskId;

    this.workflowData = null;
    this.completeStates = {};
    this.onlyStates = [];
    this.listOfStates = [];
  }

  async fetchProcessId() {
    const url = `https://dev.azure.com/${this.organization}/_apis/projects/${this.projectName}?includeCapabilities=true&api-version=7.1-preview.4`;
    try {
      const response = await axios.get(url, { headers: this.azureHeaders });
      this.processId = response.data.capabilities.processTemplate.templateTypeId;
      console.log(`✅ Process ID obtained: ${this.processId}`);
    } catch (error) {
      console.error("❌ Error fetching Process ID:", error.response?.data || error.message);
      throw new Error("Failed to retrieve Process ID");
    }
  }

  static async getCustomWorkItemTypes(organization, processId, personalAccessToken) {
    const url = `https://dev.azure.com/${organization}/_apis/work/processes/${processId}/workItemTypes?api-version=7.1`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Basic ${Buffer.from(`:${personalAccessToken}`).toString("base64")}`
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data.value
        .filter(wit => wit.customization === "custom")
        .map(wit => wit.referenceName);
    } catch (error) {
      console.error("Error fetching custom Work Item Types:", error.response?.data || error.message);
      return [];
    }
  }

  async loadWorkflowJson(workflowJsonStr) {
    const data = JSON.parse(workflowJsonStr);
    if (!data.statuses || !data.transitions) {
      throw new Error("JSON must contain 'statuses' and 'transitions' fields.");
    }
    this.workflowData = data;
  }

  parseData() {
    if (!this.workflowData) {
      throw new Error("Workflow data is empty. Call loadWorkflowJson() first.");
    }

    const statuses = this.workflowData.statuses;
    const idToName = {};
    statuses.forEach(s => idToName[s.id] = s.name);

    statuses.forEach(s => {
      this.completeStates[s.name] = [];
      this.onlyStates.push(s.name);
    });

    this.workflowData.transitions.forEach(tr => {
      const toName = idToName[tr.to];
      if (!toName) return;
      (tr.from?.length ? tr.from : this.onlyStates).forEach(fromId => {
        const fromName = idToName[fromId] || fromId;
        if (fromName) this.completeStates[fromName].push(toName);
      });
    });

    this.listOfStates = statuses.map(s => {
      const cat = WorkflowMigrator.CATEGORY_MAPPING[s.statusCategory] || {
        color: "b2b2b2",
        stateCategory: "Proposed"
      };
      return { name: s.name, color: cat.color, stateCategory: cat.stateCategory };
    });
  }

  async createStatesInAzure() {
    const url = `https://dev.azure.com/${this.organization}/_apis/work/processes/${this.processId}/workItemTypes/${this.customTaskId}/states?api-version=6.0`;

    for (const state of this.listOfStates) {
      try {
        const response = await axios.post(url, state, { headers: this.azureHeaders });
        if (response.status === 201) {
          console.log(`✅ Created state: ${state.name} for ${this.customTaskId}`);
        }
      } catch (error) {
        console.error(`❌ Error creating state '${state.name}' for ${this.customTaskId}:`, error.response?.data || error.message);
      }
    }
  }

  async createTransitionRulesInAzure() {
    const url = `https://dev.azure.com/${this.organization}/_apis/work/processes/${this.processId}/workItemTypes/${this.customTaskId}/rules?api-version=6.0`;

    for (const [origin, allowed] of Object.entries(this.completeStates)) {
      const actions = this.onlyStates.filter(s => s !== origin && !allowed.includes(s)).map(value => ({
        actionType: "disallowValue",
        targetField: "System.State",
        value
      }));

      if (!actions.length) continue;

      const payload = {
        name: `Restrict transitions from '${origin}'`,
        conditions: [{ conditionType: "whenWas", field: "System.State", value: origin }],
        actions,
        isDisabled: false
      };

      try {
        const resp = await axios.post(url, payload, { headers: this.azureHeaders });
        if (resp.status === 201) console.log(`✅ Rule created for '${origin}' in '${this.customTaskId}'`);
      } catch (e) {
        console.error(`❌ Error creating rule for '${origin}' in '${this.customTaskId}':`, e.response?.data || e.message);
      }
    }
  }

  async removeUnwantedStates(statesToRemove) {
    const baseUrl = `https://dev.azure.com/${this.organization}/_apis/work/processes/${this.processId}/workItemTypes/${this.customTaskId}/states`;
    const listUrl = `${baseUrl}?api-version=6.0`;

    try {
      const resp = await axios.get(listUrl, { headers: this.azureHeaders });
      if (resp.status !== 200) {
        console.error(`❌ Error listing states: ${resp.status}`);
        console.error(resp.data);
        return;
      }
      const existingStates = resp.data.value;
      if (!existingStates || existingStates.length === 0) {
        console.log("No states found in the current WIT.");
        return;
      }

      for (const stInfo of existingStates) {
        const stId = stInfo.id;
        const stName = stInfo.name;
        if (statesToRemove.includes(stName)) {
          console.log(`Removing state '${stName}' (ID: ${stId}) from '${this.customTaskId}'...`);
          const deleteUrl = `${baseUrl}/${stId}?api-version=6.0`;
          try {
            const delResp = await axios.delete(deleteUrl, { headers: this.azureHeaders });
            if (delResp.status === 204) {
              console.log(`✅ State '${stName}' removed from '${this.customTaskId}'.`);
            }
          } catch (deleteError) {
            console.error(`❌ Exception removing state '${stName}' from '${this.customTaskId}':`, deleteError.response?.data || deleteError.message);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching states for '${this.customTaskId}':`, error.response?.data || error.message);
    }
  }
}

(async () => {
  const ORGANIZATION = AZURE_ORG;
  const PROJECT_NAME = AZURE_PROJECT;
  const AZURE_PAT = AZURE_TOKEN;
  const WORKFLOW_JSON_STR = `{
  "id": "57e5a3ef-c4ba-472d-87fb-4f1ca549bb3f",
  "name": "Migrator",
  "description": "",
  "statuses": [
    {
      "id": "1",
      "name": "Undefined",
      "statusCategory": "Por hacer"
    },
    {
      "id": "10018",
      "name": "Completed",
      "statusCategory": "Listo"
    },
    {
      "id": "10022",
      "name": "Ready for Development",
      "statusCategory": "Por hacer"
    },
    {
      "id": "10023",
      "name": "Archived",
      "statusCategory": "Por hacer"
    },
    {
      "id": "10024",
      "name": "On Hold",
      "statusCategory": "Por hacer"
    },
    {
      "id": "10027",
      "name": "In Testing",
      "statusCategory": "En curso"
    },
    {
      "id": "10028",
      "name": "In Documentation",
      "statusCategory": "En curso"
    },
    {
      "id": "10029",
      "name": "Pending on Approbation",
      "statusCategory": "Listo"
    },
    {
      "id": "10030",
      "name": "Cancelled",
      "statusCategory": "Listo"
    },
    {
      "id": "3",
      "name": "In Progress",
      "statusCategory": "En curso"
    }
  ],
  "transitions": [
    {
      "id": "1",
      "name": "Create",
      "description": "",
      "from": [],
      "to": "1",
      "type": "initial"
    },
    {
      "id": "211",
      "name": "Archived",
      "description": "",
      "from": [],
      "to": "10023",
      "type": "global"
    },
    {
      "id": "221",
      "name": "On Hold",
      "description": "",
      "from": [],
      "to": "10024",
      "type": "global"
    },
    {
      "id": "141",
      "name": "Issues detected",
      "description": "",
      "from": [
        "10027"
      ],
      "to": "3",
      "type": "directed"
    },
    {
      "id": "151",
      "name": "Tests completed",
      "description": "",
      "from": [
        "10027"
      ],
      "to": "10028",
      "type": "directed"
    },
    {
      "id": "161",
      "name": "Documentation completed",
      "description": "",
      "from": [
        "10028"
      ],
      "to": "10029",
      "type": "directed"
    },
    {
      "id": "171",
      "name": "Task approved",
      "description": "",
      "from": [
        "10029"
      ],
      "to": "10018",
      "type": "directed"
    },
    {
      "id": "181",
      "name": "Task cancelled",
      "description": "",
      "from": [
        "10029"
      ],
      "to": "10030",
      "type": "directed"
    },
    {
      "id": "191",
      "name": "Task completed",
      "description": "No formal approval is needed.",
      "from": [
        "10028"
      ],
      "to": "10018",
      "type": "directed"
    },
    {
      "id": "231",
      "name": "Requirements established",
      "description": "",
      "from": [
        "1"
      ],
      "to": "10022",
      "type": "directed"
    },
    {
      "id": "241",
      "name": "Initial tests",
      "description": "",
      "from": [
        "3"
      ],
      "to": "10027",
      "type": "directed"
    },
    {
      "id": "251",
      "name": "Task postponed",
      "description": "",
      "from": [
        "3"
      ],
      "to": "10022",
      "type": "directed"
    },
    {
      "id": "261",
      "name": "Needs review",
      "description": "",
      "from": [
        "10022"
      ],
      "to": "1",
      "type": "directed"
    },
    {
      "id": "271",
      "name": "Needs rework",
      "description": "",
      "from": [
        "10028",
        "10029"
      ],
      "to": "3",
      "type": "directed"
    },
    {
      "id": "281",
      "name": "Task resumed",
      "description": "",
      "from": [
        "10030"
      ],
      "to": "3",
      "type": "directed"
    },
    {
      "id": "291",
      "name": "Task incomplete",
      "description": "",
      "from": [
        "10018"
      ],
      "to": "3",
      "type": "directed"
    },
    {
      "id": "301",
      "name": "Document directly",
      "description": "",
      "from": [
        "3"
      ],
      "to": "10028",
      "type": "directed"
    },
    {
      "id": "311",
      "name": "Task Cancelled",
      "description": "",
      "from": [
        "10028"
      ],
      "to": "10030",
      "type": "directed"
    },
    {
      "id": "321",
      "name": "Task retaken",
      "description": "",
      "from": [
        "10023",
        "10024"
      ],
      "to": "10022",
      "type": "directed"
    },
    {
      "id": "81",
      "name": "Development starts",
      "description": "",
      "from": [
        "10022"
      ],
      "to": "3",
      "type": "directed"
    }
  ]
  }`; 
  const UNWANTED_STATES = ["New", "Committed"];

  const migrator = new WorkflowMigrator(ORGANIZATION, PROJECT_NAME, null, AZURE_PAT);
  await migrator.fetchProcessId();

  const customWorkItemTypes = await WorkflowMigrator.getCustomWorkItemTypes(ORGANIZATION, migrator.processId, AZURE_PAT);
  
  for (const customTaskId of customWorkItemTypes) {
    console.log(`🔄 Aplicando workflow a ${customTaskId}...`);
    migrator.customTaskId = customTaskId;
    try {
      migrator.loadWorkflowJson(WORKFLOW_JSON_STR);
      migrator.parseData();
      await migrator.createStatesInAzure();
      await migrator.createTransitionRulesInAzure();
      await migrator.removeUnwantedStates(UNWANTED_STATES);
    } catch (err) {
      console.error(`❌ Error en la migración para ${customTaskId}:`, err.message);
    }
  }
})();
