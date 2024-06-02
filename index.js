const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 8000;
const accessToken = process.env.ACCESS_TOKEN;
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = require("stripe")(stripeSecret);

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
    const db = client.db("smartCom");
    const usersCollection = db.collection("users");

    /******************************* Payment ******************************************/
    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price || priceInCent < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });
    });
    /******************************* Payment ******************************************/

    /******************************* Users ******************************************/
    // get role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      let role = '';
      if (user) {
        role = user?.role;
      }
      res.send({ role: role });
    });

    // create user
    app.post("/add-hr", async (req, res) => {
      const data = req.body;
      const addedRole = { ...data, role: "HR" };
      const result = await usersCollection.insertOne(addedRole);
      res.send(result);
    });
    // update user
    /******************************* Payment ******************************************/
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
