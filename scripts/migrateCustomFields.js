const fs = require("fs");
const axios = require("axios");
const { AZURE_ORG, AZURE_TOKEN } = require("../config/credentials");

const CUSTOM_FIELDS_PATH = "./json_files";

const typeMapping = {
  String: "String",
  Integer: "Integer",
  DateTime: "DateTime",
  Boolean: "Boolean",
  Double: "Double",
};

async function runMigrateCustomFields() {
  try {
    const files = fs.readdirSync(CUSTOM_FIELDS_PATH).filter(file => file.endsWith(".json"));
    if (files.length === 0) {
      console.log("No hay archivos JSON para procesar.");
      return;
    }

    let results = [];

    for (const file of files) {
      const filePath = `${CUSTOM_FIELDS_PATH}/${file}`;
      const rawData = fs.readFileSync(filePath, "utf8");
      const jsonData = JSON.parse(rawData);

      const idNumber = jsonData.id.match(/\d+/)[0];

      const transformedData = {
        name: jsonData.name,
        referenceName: `Custom.${idNumber}.${jsonData.name}`,
        description: jsonData.description,
        type: typeMapping[jsonData.type] || "String",
        usage: "workItem",
      };

      const url = `https://dev.azure.com/${AZURE_ORG}/_apis/wit/fields?api-version=7.1-preview.2`;

      try {
        const response = await axios.post(url, transformedData, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`:${AZURE_TOKEN}`).toString("base64")}`,
          },
        });
        results.push({ file, status: "Success", data: response.data });
      } catch (error) {
        results.push({ file, status: "Failed", error: error.response?.data || error.message });
      }
    }

    console.log("Resultados de la migración de custom fields:", results);
  } catch (error) {
    console.error("Error en la migración de custom fields:", error.message);
  }
}

module.exports = runMigrateCustomFields;
