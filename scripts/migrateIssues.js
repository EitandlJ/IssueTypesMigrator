const axios = require("axios");
const env = require("../config/credentials"); // Importamos las variables de entorno desde env.js


async function fetchProcessId() {
    const { AZURE_ORG, AZURE_PROJECT, AZURE_TOKEN } = env;
    const url = `https://dev.azure.com/${AZURE_ORG}/_apis/projects/${AZURE_PROJECT}?includeCapabilities=true&api-version=7.1-preview.4`;

    try {
        const response = await axios.get(url, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${Buffer.from(":" + AZURE_TOKEN).toString("base64")}`
            }
        });
        const processId = response.data.capabilities.processTemplate.templateTypeId;
        console.log(`✅ Process ID obtenido: ${processId}`);
        return processId;
    } catch (error) {
        console.error("❌ Error al obtener el Process ID:", error.response?.data || error.message);
        throw new Error("No se pudo obtener el Process ID");
    }
}

async function createWorkItemTypes(processId) {
    const { AZURE_ORG, AZURE_TOKEN } = env;
    const apiUrl = `https://dev.azure.com/${AZURE_ORG}/_apis/work/processdefinitions/${processId}/workitemtypes?api-version=4.1-preview.1`;

    for (const item of WORK_ITEM_TYPES) {
        try {
            await axios.post(apiUrl, item, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Basic ${Buffer.from(":" + AZURE_TOKEN).toString("base64")}`
                }
            });
            console.log(`✅ Work Item Type creado: ${item.name}`);
        } catch (error) {
            console.error(`❌ Error creando Work Item Type ${item.name}:`, error.response ? error.response.data : error.message);
        }
    }
}

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
        return response.data.id; // Devolver el ID del Work Item creado
    } catch (error) {
        console.error("❌ Error al crear Work Item:", error.response ? error.response.data : error.message);
        throw error; // Lanzar el error para manejarlo en el flujo principal
    }
}

const WORK_ITEM_TYPES = [
    {
        "name": "Bug1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Bug Work Item",
        "id": "custom.bug1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "Epic1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Epic Work Item",
        "id": "custom.epic1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "Feature1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Feature Work Item",
        "id": "custom.feature1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "Impediment1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Impediment Work Item",
        "id": "custom.impediment1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "ProductBacklogItem1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Product Backlog Item Work Item",
        "id": "custom.productbacklogitem1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "Task1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Task Work Item",
        "id": "custom.task1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "TestCase1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Test Case Work Item",
        "id": "custom.testcase1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "TestPlan1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Test Plan Work Item",
        "id": "custom.testplan1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    },
    {
        "name": "TestSuite1",
        "states": [],
        "behaviors": [],
        "color": "007ACC",
        "icon": "icon_clipboard",
        "description": "Custom Test Suite Work Item",
        "id": "custom.testsuite1",
        "inherits": null,
        "isDisabled": false,
        "layout": null,
        "url": null,
        "class": null
    }
];


// Exportar la función
module.exports = { createWorkItem, createWorkItemTypes, fetchProcessId };
