const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "https://islampur-jame-masjid.vercel.app"],
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6cld7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection

    const userCollection = client.db("MosqueDB").collection("users");
    const adminCollection = client.db("MosqueDB").collection("admin");
    const paymentCollection = client.db("MosqueDB").collection("payment");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    app.get("/admin/:number", async (req, res) => {
      const number = req.params.number;
      const query = { number: number };
      const result = await adminCollection.findOne(query);
      res.send(result);
    });
    app.get("/verifyAdmin/:number", async (req, res) => {
      const number = req.params.number;
      const query = { number: number };
      const result = await adminCollection.findOne(query);
      let admin = false;
      if (result) {
        admin = result.admin;
      }
      res.send(admin);
    });
    app.get("/users", async (req, res) => {
      const filter = req.query;
      const query = {
        Name: { $regex: filter.search, $options: "i" },
        NameBn: { $regex: filter.searchBn, $options: "i" },
        HomeName: { $regex: filter.HomeName },
      };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/usersHome", async (req, res) => {
      const result = await userCollection
        .find({}, { projection: { HomeName: 1 } })
        .toArray();
      res.send(result);
    });

    app.get("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.post("/addUser", async (req, res) => {
      const addedUser = req.body;
      const query = {
        Number: addedUser.Number,
        HomeName: addedUser.HomeName,
        Name: addedUser.Name,
      };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(addedUser);
      res.send(result);
    });

    // editing fees

    app.patch("/editFee/:id", async (req, res) => {
      const id = req.params.id;
      const editFee = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          FeeRate: editFee.FeeRate,
          "Tarabi.fee": editFee.TarabiFee,
          Due: editFee.DueFee,
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // edit month status to paid
    app.patch("/monthStatus", async (req, res) => {
      const { id, selectedMonth } = req.body;
      const query = {
        _id: new ObjectId(id),
        "PayMonths.monthName": selectedMonth,
      };
      const result = await userCollection.updateOne(query, {
        $set: { "PayMonths.$.status": "paid" },
      });
      res.send(result);
    });

    app.patch("/multiple-months", async (req, res) => {
      const updating = req.body;
      const filter = {
        _id: new ObjectId(updating.id),
        "PayMonths.monthName": { $in: updating.months },
      };
      const update = { $set: { "PayMonths.$[elem].status": "paid" } };
      const options = {
        arrayFilters: [{ "elem.monthName": { $in: updating.months } }],
      };
      const result = await userCollection.updateOne(filter, update, options);
      res.send(result);
    });

    app.patch("/tarabeePaid/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.updateOne(query, {
        $set: { "Tarabi.status": "paid" },
      });
      res.send(result);
    });

    app.patch("/activity", async (req, res) => {
      const result = await userCollection.updateMany({}, [
        {
          $set: {
            "Tarabi.active": {
              $cond: {
                if: { $eq: ["$Tarabi.active", true] },
                then: false,
                else: true
              }
            }
          }
        }
      ]);
      res.send(result);
    });
    app.get('/activeStatus', async (req,res) =>{
      const activeStatus = await userCollection.findOne({}, { projection: { "Tarabi.active": 1 } });
      res.send(activeStatus?.Tarabi?.active);
    })

    app.get('/monthly-stats', async (req, res)=>{
      const pipeline = [
        {
          $addFields: {
            feeRateAsNumber: { $toDouble: "$FeeRate" },
            paidMonthCount: {
              $size: {
                $filter: {
                  input: "$PayMonths",
                  as: "month",
                  cond: { $eq: ["$$month.status", "paid"] }
                }
              }
            }
          }
        },
        {
          $addFields: {
            totalPaidByUser: { $multiply: ["$feeRateAsNumber", "$paidMonthCount"] }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$totalPaidByUser" }
          }
        }
      ];
      const result = await userCollection.aggregate(pipeline).toArray();
      res.send(result)
    })

    app.get('/tarabi-stats', async (req,res)=>{
      const pipeline = [
        {
          $match : {
            "Tarabi.status": "paid"
          }
        },
        {
          $addFields: {
            feeAsNumber: { $toDouble: "$Tarabi.fee" }
          }
        },
        {
          $group: {
            _id: null,
            totalPaidUsers: { $sum: 1 },
            totalAmount: { $sum: "$feeAsNumber" }
          }
        }
          
      ];
      const pipeline2 = [
        {
          $match : {
            "Tarabi.status": "unpaid"
          }
        },
        {
          $addFields: {
            feeAsNumber: { $toDouble: "$Tarabi.fee" }
          }
        },
        {
          $group: {
            _id: null,
            totalUnpaidUsers: { $sum: 1 },
            totalUnpaidAmount: { $sum: "$feeAsNumber" }
          }
        }

      ];
      const result = await userCollection.aggregate(pipeline).toArray();
      const result2 = await userCollection.aggregate(pipeline2).toArray();
      if (result.length === 0) {
        return res.send({
          paidStats: {
            totalPaidUsers: 0,
            totalAmount: 0
          },
          unpaidStats:{
            totalUnpaidUsers: result2[0].totalUnpaidUsers,
            totalUnpaidAmount: result2[0].totalUnpaidAmount
          }

        });
      }
      res.send({
        paidStats: result[0],
        unpaidStats: result2[0]
      });
    })
    
    app.post('/payment', async (req, res)=>{
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData)
      res.send(result)
    })
    app.get('/paymentHistory', async (req, res)=>{
      const result = await paymentCollection.find().toArray()
      res.send(result)
    })

    app.get('/total-payment', async (req, res) => {
      
        const pipeline = [
          {
            $addFields: {
              feeAsNumber: {
                $cond: {
                  if: { $isNumber: "$fee" },
                  then: "$fee",
                  else: { $toDouble: "$fee" }
                }
              }
            }
          },
          {
            $group: {
              _id: "$type",
              totalAmount: { $sum: "$feeAsNumber" }
            }
          }
        ];
    
        const result = await paymentCollection.aggregate(pipeline).toArray();

        const mapped = {};
  result.forEach(item => {
    mapped[item._id] = item;
  });  
  console.log(mapped);

        res.send({
    Tarabi: mapped.Tarabi || { _id: "Tarabi", totalAmount: 0 },
    Monthly: mapped.Monthly || { _id: "Monthly", totalAmount: 0 },
    Due: mapped.Due || { _id: "Due", totalAmount: 0 }
  });
     
    });
    
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Islampur Jame Masjid is running");
});

app.listen(port, () => {
  console.log(`Islampur Jame Masjid is running on port, ${port}`);
});





