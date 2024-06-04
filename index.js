const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 8000;
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
    const assetsCollection = db.collection("assets");
    const requestCollection = db.collection("requests");

    /************ MIDDLEWARE API **************/
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decode;
        next();
      });
    };
    const verifyHr = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });
      const isHR = user?.role === "HR";
      if (!isHR) {
        return res.status(401).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyEmployee = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });
      const isEmployee = user?.role === "EMPLOYEE";
      if (!isEmployee) {
        return res.status(401).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user?.role === "ADMIN";
      if (!isAdmin) {
        return res.status(401).send({ message: "forbidden access" });
      }
      next();
    };
    /************ MIDDLEWARE API **************/

    /************ JWT API **************/
    // create token
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.json({ token: token });
    });

    /************ JWT API **************/

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
      let role = "";
      if (user) {
        role = user?.role;
      }
      res.send({ role: role });
    });
    // get user
    app.get("/users/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email: email });
      res.send(result);
    });

    // create hr
    app.post("/users/hr", async (req, res) => {
      const data = req.body;
      const addedRole = { ...data, role: "HR", verified: true };
      const result = await usersCollection.insertOne(addedRole);
      res.send(result);
    });

    // create employee
    app.post("/users/employee", async (req, res) => {
      const data = req.body;
      const newData = { ...data, role: "EMPLOYEE", verified: false };
      const result = await usersCollection.insertOne(newData);
      res.send(result);
    });

    // all company name
    app.get("/users/company", async (req, res) => {
      const query = {
        role: "HR",
      };
      const options = {
        projection: { _id: 0, company_name: 1, company_logo: 1 },
      };

      const result = await usersCollection.find(query, options).toArray();
      res.send(result);
    });

    // employee request
    app.get("/users/employees-request/:email", async (req, res) => {
      const email = req.params.email;
      const hr = await usersCollection.findOne({ email: email });
      if (hr) {
        const all_request = await usersCollection
          .find({ company_name: hr.company_name, verified: false })
          .toArray();
        res.send(all_request);
      }
    });
    //all  employee
    app.get(
      "/users/all-employees/:email",
      verifyToken,
      verifyHr,
      async (req, res) => {
        const email = req.params.email;
        const hr = await usersCollection.findOne({ email: email });
        if (hr) {
          const all_employee = await usersCollection
            .find({ company_name: hr.company_name })
            .toArray();
          res.send(all_employee);
        }
      }
    );

    //edit  verified employee
    app.put("/users/verified_employee/:id", async (req, res) => {
      const id = req.params.id;
      const employee = await usersCollection.findOne({ _id: new ObjectId(id) });
      let verified = employee.verified ? false : true;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { verified: verified } }
      );
      res.send(result);
    });

    /******************************* Users ******************************************/

    /******************************* assets ******************************************/
    // add assets
    app.post("/assets", async (req, res) => {
      const data = req.body;
      const result = await assetsCollection.insertOne(data);
      res.send(result);
    });
    // all assets
    app.get("/assets", async (req, res) => {
      const result = await assetsCollection.find({}).toArray();
      res.send(result);
    });
    // search assets
    // search volunteers by title and category
    app.get("/assets-search", async (req, res) => {
      const search = req.query.search;
      let query = {
        $or: [
          {
            product_name: { $regex: search, $options: "i" },
          },
          { status: { $regex: search, $options: "i" } },
        ],
      };
      const result = await assetsCollection.find(query).toArray();
      res.send(result);
    });

    // delete assets
    app.delete("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const result = await assetsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // // edit assets
    app.patch("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const update = req.body;
      const result = await assetsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update },
        { upsert: true }
      );
      res.json(result);
    });

    // // get assets by id
    // app.get("/assets/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const result = await assetsCollection.findOne({ _id: new ObjectId(id) });
    //   res.send(result);
    // });

    // get assets by id
    // app.get("/assets/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const result = await assetsCollection.findOne({ _id: new ObjectId(id) });
    //   res.send(result);
    // });
    // edit assets
    /******************************* assets ******************************************/

    /******************************* request ******************************************/
    // request assets
    app.post("/request", async (req, res) => {
      const data = req.body;
      const assets_id = data.assets_id;
      const decreaseAssets = await assetsCollection.updateOne(
        {
          _id: new ObjectId(assets_id),
        },
        {
          $inc: { quantity: -1 },
        }
      );
      const result = await requestCollection.insertOne(data);
      res.send(result);
    });

    // all request
    app.get("/request", async (req, res) => {
      const result = await requestCollection.find({}).toArray();
      res.send(result);
    });
    // delete request
    app.delete("/request/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    // edit request
    /******************************* request ******************************************/

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
