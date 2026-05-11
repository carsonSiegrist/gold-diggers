fetch("https://services5.arcgis.com/aEZWbbQHTw7fmHLY/arcgis/rest/services/ArizonaMiningClaims/FeatureServer/20/query?f=pbf&geometry=-11897270.578530993%2C4383204.949986987%2C-11584184.510674994%2C4696291.017842988&maxRecordCountFactor=4&resultOffset=0&resultRecordCount=8000&where=1%3D1&orderByFields=OBJECTID%20ASC&outFields=Join_Count%2COBJECTID&quantizationParameters=%7B%22extent%22%3A%7B%22xmin%22%3A-11897270.578530993%2C%22ymin%22%3A4383204.949986987%2C%22xmax%22%3A-11584184.510674994%2C%22ymax%22%3A4696291.017842988%7D%2C%22mode%22%3A%22view%22%2C%22originPosition%22%3A%22upperLeft%22%2C%22tolerance%22%3A611.4962262812505%7D&resultType=tile&spatialRel=esriSpatialRelIntersects&geometryType=esriGeometryEnvelope&defaultSR=102100", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": "\"Android\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "Referer": "https://experience.arcgis.com/experience/4a3b9406973e47d7aa5cf476500e7298/"
  },
  "body": null,
  "method": "GET"
}).then(console.log);