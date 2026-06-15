const fs = require("fs");
const path = require("path");

const applicationsFolder =
    path.join(__dirname, "applications");

const files =
    fs.readdirSync(applicationsFolder)
      .filter(file => file.endsWith(".csv"));

fs.writeFileSync(
    path.join(applicationsFolder, "index.json"),
    JSON.stringify(files, null, 2)
);

console.log(
    `index.json updated with ${files.length} CSV files`
);