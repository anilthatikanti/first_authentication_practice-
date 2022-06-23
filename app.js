const express = require("express");
const { open } = require("sqlite");
const path = require("path");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    process.exit(1);
    console.log(`DB Error: ${e.message}`);
  }
};

initializeDBAndServer();

const stateDetails = (nameOfState) => {
  return {
    stateId: nameOfState.state_id,
    stateName: nameOfState.state_name,
    population: nameOfState.population,
  };
};

const districtDetails = (nameOfDistrict) => {
  return {
    districtId: nameOfDistrict.district_id,
    districtName: nameOfDistrict.district_name,
    stateId: nameOfDistrict.state_id,
    cases: nameOfDistrict.cases,
    cured: nameOfDistrict.cured,
    active: nameOfDistrict.active,
    deaths: nameOfDistrict.deaths,
  };
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const DbUser = await db.get(getUserQuery);

  if (DbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, DbUser.password);
    if (isPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "my_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticationToken, async (request, response) => {
  const getStateQuery = `
    SELECT * FROM state;`;
  const stateArray = await db.all(getStateQuery);
  response.send(stateArray.map((eachState) => stateDetails(eachState)));
});

app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * FROM state
    WHERE 
        state_id = ${stateId};`;
  const getState = await db.get(getStateQuery);
  response.send(stateDetails(getState));
});

app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistrictQuery = `
    INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
    VALUES('${districtName}',${stateId},'${cases}','${cured}','${active}','${deaths}');`;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT
     *
    FROM
     district 
     WHERE
      district_id = ${districtId};`;
    const district = await db.get(getDistrictQuery);
    response.send(districtDetails(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDeleteQuery = `
    DELETE FROM district WHERE district_id = ${districtId};`;
    await db.run(districtDeleteQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateQuery = `
    UPDATE
         district 
    SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE 
        district_id = ${districtId};`;
    await db.run(updateQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStats = `
    SELECT 
        SUM(cases),
        SUM(cured),
        SUM(active),
        SUM(deaths)
    FROM 
        district 
    WHERE 
        state_id = ${stateId};`;
    const stats = await db.get(getStateStats);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
