const axios = require("axios");
require("dotenv").config();

// Función para crear un Work Item en Azure DevOps
async function createWorkItem(workItemData) {
    const org = process.env.AZURE_ORG;
    const project = process.env.AZURE_PROJECT;
    const token = process.env.AZURE_TOKEN;
    const apiUrl = `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$Issue?api-version=7.1-preview.3`;

    const payload = Object.entries(workItemData.fields).map(([key, value]) => ({
        op: "add",
        path: `/fields/${key}`,
        value: value
    }));

    try {
        const response = await axios.patch(apiUrl, payload, {
            headers: {
                "Content-Type": "application/json-patch+json",
                "Authorization": `Basic ${Buffer.from(":" + token).toString("base64")}`
            }
        });

        console.log("✅ Work Item Creado:", response.data.id);
    } catch (error) {
        console.error("❌ Error al crear Work Item:", error.response ? error.response.data : error.message);
    }
}

// Exportar la función
module.exports = { createWorkItem };
