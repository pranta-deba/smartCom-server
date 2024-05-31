const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 8000;
const accessToken = process.env.ACCESS_TOKEN;

app.use(cors());
app.use(express.json());

// db connection
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const url = `mongodb+srv://${dbUser}:${dbPass}@cluster0.ojaopqr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(url, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();





    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});
6;

app.listen(port, () => {
  console.log(`Smart-Asset is running in ${port} port.`);
});

//
//
