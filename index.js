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
    // await client.connect();
    const db = client.db("smartCom");
    const usersCollection = db.collection("users");
    const assetsCollection = db.collection("assets");
    const requestCollection = db.collection("requests");
    const noticeCollection = db.collection("notices");

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

    // create hr : hit by hr
    app.post("/users/hr", async (req, res) => {
      const data = req.body;
      const hr = await usersCollection.findOne({ email: data.email });
      if (hr) {
        const totalMembers = parseInt(hr.members) + parseInt(data.members);
        const totalRate =
          parseInt(hr.packages_rate) + parseInt(data.packages_rate);
        const updated = await usersCollection.updateOne(
          { email: data.email },
          {
            $set: {
              members: totalMembers,
              transactionId: data.transactionId,
              expiration_date: data.expiration_date,
              packages_rate: totalRate,
            },
          }
        );
        return res.send(updated);
      }
      const addedRole = { ...data, role: "HR", verified: true };
      const result = await usersCollection.insertOne(addedRole);
      res.send(result);
    });

    // update user
    app.patch("/users/update", async (req, res) => {
      const data = req.body;
      const filter = { email: data.email };
      const update = {
        $set: { full_name: data.full_name, profile: data.profile },
      };
      const options = { upsert: true };
      const updated = await usersCollection.updateOne(filter, update, options);
      res.send(updated);
    });

    // create employee : hit by employee
    app.post("/users/employee", async (req, res) => {
      const data = req.body;
      const employeeExits = await usersCollection.findOne({
        email: data.email,
      });
      if (employeeExits) {
        return res.send({ insertedId: true });
      }
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
    // get all requested by hr
    app.get("/request/requested", async (req, res) => {
      const company = req.query.company;
      const result = await requestCollection
        .find({ "requestor.company_name": company })
        .toArray();
      res.send(result);
    });

    // search by email or name : hit by HR
    app.get("/request/search", async (req, res) => {
      const search = req.query.search;
      const company = req.query.company;
      let query = {
        "requestor.company_name": company,
        $or: [
          { "requestor.email": { $regex: search, $options: "i" } },
          { "requestor.name": { $regex: search, $options: "i" } },
        ],
      };
      const result = await requestCollection.find(query).toArray();
      res.send(result);
    });

    // approved : hit by HR
    app.patch("/request/approved/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approved", approval_date: new Date() } }
      );
      res.send(result);
    });

    // rejected : hit by HR
    app.patch("/request/rejected/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "pending", approval_date: null } }
      );
      res.send(result);
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

    // remove employee : hit by hr
    app.delete("/employee/remove/:id", async (req, res) => {
      const id = req.params.id;
      const company = req.query.company;
      const decreaseMember = await usersCollection.updateOne(
        {
          company_name: company,
          role: "HR",
        },
        {
          $inc: { members: -1 },
        }
      );
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //all team member
    app.get("/request/team", verifyToken, async (req, res) => {
      const company = req.query.company;
      const teams = await usersCollection
        .find({ company_name: company })
        .toArray();
      res.send(teams);
    });

    //edit verified employee : hit by HR
    app.put("/users/verified_employee/:id", async (req, res) => {
      const id = req.params.id;
      const company = req.query.company;
      const decrementMember = await usersCollection.updateOne(
        { company_name: company, role: "HR" },
        {
          $inc: { members: -1 },
        }
      );
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
      const company = req.query.company;
      const result = await assetsCollection.find({company_name:company}).toArray();
      res.send(result);
    });
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
    app.get("/assets/:id", async (req, res) => {
      const id = req.params.id;
      const result = await assetsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // edit assets
    /******************************* assets ******************************************/

    /******************************* request ******************************************/
    // request assets
    app.post("/request", verifyToken, verifyEmployee, async (req, res) => {
      const data = req.body;
      const assets_id = data.assets_id;
      const total = await requestCollection.countDocuments({
        status: "pending",
      });

      if (total > 5) {
        return res.send({ message: "Already 5 item requested, please wait" });
      }

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
      const email = req.query.email;
      const result = await requestCollection
        .find({ "requestor.email": email })
        .toArray();
      res.send(result);
    });

    // cancel request
    app.delete("/request/cancel/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // return request assets
    app.put("/request/return/:id", async (req, res) => {
      const id = req.params.id;
      const result = await requestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "returned" } }
      );
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
    // search request
    app.get("/request-search", async (req, res) => {
      const search = req.query.search;
      let query = {
        $or: [
          {
            product_name: { $regex: search, $options: "i" },
          },
        ],
      };
      const result = await requestCollection.find(query).toArray();
      res.send(result);
    });

    // hr stat
    app.get("/request-stat", async (req, res) => {
      const total = await requestCollection.estimatedDocumentCount();
      const returnableCount = await requestCollection.countDocuments({
        type: "returnable",
      });
      const nonReturnableCount = await requestCollection.countDocuments({
        type: "non-returnable",
      });

      const returnablePercentage = (returnableCount / total) * 100;
      const nonReturnablePercentage = (nonReturnableCount / total) * 100;

      res.send({
        returnablePercentage: returnablePercentage.toFixed(2),
        nonReturnablePercentage: nonReturnablePercentage.toFixed(2),
        total: total,
      });
    });
    /******************************* request ******************************************/

    /******************************* notice ******************************************/
    // add notice
    app.patch("/notice", async (req, res) => {
      const data = req.body;
      const filter = { company_name: data.company_name };
      const update = {
        $set: {
          company_name: data.company_name,
          notice: data.notice,
        },
      };
      const options = { upsert: true };
      const result = await noticeCollection.updateOne(filter, update, options);
      res.send(result);
    });
    // all notice
    app.get("/notice", async (req, res) => {
      const company = req.query.company;
      console.log(company);
      const result = await noticeCollection.findOne({ company_name: company });
      res.send(result);
    });
    /******************************* notice ******************************************/

    // await client.db("admin").command({ ping: 1 });
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
