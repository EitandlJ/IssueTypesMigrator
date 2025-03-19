# IssueTypesMigrator
# Migrador de Jira a Azure DevOps

Este proyecto está diseñado para migrar los **Issue Types** de Jira a **Azure DevOps** utilizando la API de ambos sistemas. Permite convertir los datos de un *Issue* de Jira en un *Work Item* de Azure DevOps, realizando mapeos de campos, incluyendo prioridad, etiquetas, fecha de creación, y más.

## Requisitos

Asegúrate de tener instalados los siguientes requisitos previos en tu sistema:

- **Node.js**: Este proyecto está desarrollado con Node.js. Asegúrate de tenerlo instalado. Puedes verificar la instalación de Node.js con el siguiente comando:

  node -v

Para utilizar el código modifica el archivo .env y reemplaza los valores por tus credenciales y los de tu organización:

AZURE_ORG=tu-organizacion
AZURE_PROJECT=tu-proyecto
AZURE_TOKEN=tu-token-de-azure

Y para correrlo, ejecuta el siguiente comando en tu terminal:

node index.js