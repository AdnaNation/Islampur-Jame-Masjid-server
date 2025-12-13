const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const { default: axios } = require("axios");
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
    const userCollection2 = client.db("MosqueDB").collection("usersdata");
    const shopKeeperCollection = client.db("MosqueDB").collection("shopKeeper");
    const adminCollection = client.db("MosqueDB").collection("admin");
    const paymentCollection = client.db("MosqueDB").collection("payment");
    const smsCollection = client.db("MosqueDB").collection("sms");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    app.get("/check-balance", async (req, res) => {
      const url = `https://api.mimsms.com/api/SmsSending/balanceCheck?userName=${process.env.API_USERNAME}&Apikey=${process.env.API_KEY}`;
      const response = await axios.get(url);
      res.json({ balance: response.data.responseResult });
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

    app.get("/userByNumber/:number", async (req, res) => {
      const number = req.params.number;
      const query = { Number: number };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/shopKeeper", async (req, res) => {
      const result = await shopKeeperCollection.find().toArray();
      res.send(result);
    });

    app.get("/usersHome", async (req, res) => {
      const result = await userCollection
        .find({}, { projection: { HomeName: 1 } })
        .toArray();
      res.send(result);
    });
    app.get("/usersNumber", async (req, res) => {
      const result = await userCollection
        .find({ Number: { $regex: /^\d{11}$/ } }, { projection: { Number: 1 } })
        .toArray();
      res.send(result);
    });

    app.get("/shopKeeper/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await shopKeeperCollection.findOne(query);
      res.send(result);
    });

    app.get("/usersName/:home", async (req, res) => {
      const userHome = req.params.home;
      const query = { HomeName: userHome };
      if (query.HomeName === "home") {
        const result = await userCollection
          .find({}, { projection: { NameBn: 1 } })
          .toArray();
        res.send(result);
      } else {
        const result = await userCollection
          .find(query, { projection: { NameBn: 1 } })
          .toArray();
        res.send(result);
      }
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

    app.post("/addShopKeeper", async (req, res) => {
      const addedUser = req.body;
      const query = {
        NameBn: addedUser.NameBn,
      };
      const existingUser = await shopKeeperCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await shopKeeperCollection.insertOne(addedUser);
      res.send(result);
    });

    // editing fees

    app.patch("/editUserData/:id", async (req, res) => {
      const id = req.params.id;
      const userData = req.body;
      const query = { _id: new ObjectId(id) };
      const query2 = { userId: id };
      const updatedDoc = {
        $set: {
          NameBn: userData.NameBn,
          Name: userData.Name,
          HomeName: userData.HomeName,
          Number: userData.Number,
        },
      };
      const updatedDoc2 = {
        $set: {
          name: userData.NameBn,
          home: userData.HomeName,
        },
      };
      const result = await userCollection.updateOne(query, updatedDoc);
      if (result.modifiedCount > 0) {
        paymentCollection.updateMany(query2, updatedDoc2);
      }
      res.send(result);
    });
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

    app.patch("/payDue/:id", async (req, res) => {
      const id = req.params.id;
      const editFee = req.body;
      console.log(editFee);
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.updateOne(query, {
        $set: {
          Due: editFee.DueFee,
        },
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
                else: true,
              },
            },
          },
        },
      ]);
      res.send(result);
    });
    app.get("/activeStatus", async (req, res) => {
      const activeStatus = await userCollection.findOne(
        {},
        { projection: { "Tarabi.active": 1 } }
      );
      res.send(activeStatus?.Tarabi?.active);
    });

    app.get("/monthly-stats", async (req, res) => {
      const pipeline = [
        {
          $addFields: {
            feeRateAsNumber: { $toDouble: "$FeeRate" },
            paidMonthCount: {
              $size: {
                $filter: {
                  input: "$PayMonths",
                  as: "month",
                  cond: { $eq: ["$$month.status", "paid"] },
                },
              },
            },
          },
        },
        {
          $addFields: {
            totalPaidByUser: {
              $multiply: ["$feeRateAsNumber", "$paidMonthCount"],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$totalPaidByUser" },
          },
        },
      ];
      const result = await userCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get("/tarabi-stats", async (req, res) => {
      const pipeline = [
        {
          $match: {
            "Tarabi.status": "paid",
          },
        },
        {
          $addFields: {
            feeAsNumber: { $toDouble: "$Tarabi.fee" },
          },
        },
        {
          $group: {
            _id: null,
            totalPaidUsers: { $sum: 1 },
            totalAmount: { $sum: "$feeAsNumber" },
          },
        },
      ];
      const pipeline2 = [
        {
          $match: {
            "Tarabi.status": "unpaid",
          },
        },
        {
          $addFields: {
            feeAsNumber: { $toDouble: "$Tarabi.fee" },
          },
        },
        {
          $group: {
            _id: null,
            totalUnpaidUsers: { $sum: 1 },
            totalUnpaidAmount: { $sum: "$feeAsNumber" },
          },
        },
      ];
      const result = await userCollection.aggregate(pipeline).toArray();
      const result2 = await userCollection.aggregate(pipeline2).toArray();
      if (result.length === 0) {
        return res.send({
          paidStats: {
            totalPaidUsers: 0,
            totalAmount: 0,
          },
          unpaidStats: {
            totalUnpaidUsers: result2[0].totalUnpaidUsers,
            totalUnpaidAmount: result2[0].totalUnpaidAmount,
          },
        });
      }
      res.send({
        paidStats: result[0],
        unpaidStats: result2[0],
      });
    });

    app.post("/payment", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });
    app.get("/paymentHistory", async (req, res) => {
      const filter = req.query;
      const query = {
        name: { $regex: filter.name },
        home: { $regex: filter.home },
      };
      if (query.home.$regex === "home") {
        const result = await paymentCollection.find().toArray();
        res.send(result);
      } else {
        const result = await paymentCollection.find(query).toArray();
        res.send(result);
      }
    });

    app.get("/total-payment", async (req, res) => {
      const pipeline = [
        {
          $addFields: {
            feeAsNumber: {
              $cond: {
                if: { $isNumber: "$fee" },
                then: "$fee",
                else: { $toDouble: "$fee" },
              },
            },
          },
        },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$feeAsNumber" },
          },
        },
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();

      const mapped = {};
      result.forEach((item) => {
        mapped[item._id] = item;
      });
      res.send({
        Tarabi: mapped.Tarabi || { _id: "Tarabi", totalAmount: 0 },
        Monthly: mapped.Monthly || { _id: "Monthly", totalAmount: 0 },
        Due: mapped.Due || { _id: "Due", totalAmount: 0 },
      });
    });
    // sms sending api
    app.post("/sms", async (req, res) => {
      const { number, message } = req.body;
      const payload = {
        UserName: `${process.env.API_USERNAME}`,
        Apikey: `${process.env.API_KEY}`,
        MobileNumber: `88${number}`,
        CampaignId: "Islampur Jame Masjid",
        SenderName: "8809601004618",
        TransactionType: "T",
        Message: message,
      };
      try {
        const response = await axios.post(
          "https://api.mimsms.com/api/SmsSending/SMS",
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        res.send({
          success: true,
          data: response.data,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          error: error.response?.data || error.message,
        });
      }
    });

    app.post("/sms-db", async (req, res) => {
      const body = req.body;
      const alreadyExisted = await smsCollection.findOne({
        number: body.number,
      });
      if (!alreadyExisted) {
        const insertResult = await smsCollection.insertOne(body);
        return res.send({ status: "inserted", result: insertResult });
      }

      if (alreadyExisted.lastSendingMonth !== body.lastSendingMonth) {
        const updateResult = await smsCollection.updateOne(
          { number: body.number },
          {
            $set: { lastSendingMonth: body.lastSendingMonth },
          }
        );
        return res.send({ status: "updated", result: updateResult });
      }
      return res.send({
        status: "skipped",
        message: "Already sent for this month",
      });
    });

    // app.patch("/closing-year", (req, res) => {
    //   userCollection2
    //     .updateMany({}, [
    //       {
    //         $set: {
    //           unpaidCount: {
    //             $size: {
    //               $filter: {
    //                 input: "$PayMonths",
    //                 as: "m",
    //                 cond: { $eq: ["$$m.status", "unpaid"] },
    //               },
    //             },
    //           },
    //         },
    //       },
    //       {
    //         $set: {
    //           prevYear: {
    //             PayMonths: "$PayMonths",
    //             Tarabi: "$Tarabi",
    //             FeeRate: "$FeeRate",
    //             Due: {
    //               $add: [
    //                 {
    //                   $cond: [
    //                     { $eq: ["$Tarabi.status", "unpaid"] },
    //                     { $toDouble: "$Tarabi.fee" },
    //                     0,
    //                   ],
    //                 },
    //                 {
    //                   $multiply: [{ $toDouble: "$FeeRate" }, "$unpaidCount"],
    //                 },
    //                 { $toDouble: "$Due" },
    //               ],
    //             },
    //           },
    //         },
    //       },
    //       {
    //         $set: {
    //           Due: {
    //             $add: [
    //               {
    //                 $cond: [
    //                   { $eq: ["$Tarabi.status", "unpaid"] },
    //                   { $toDouble: "$Tarabi.fee" },
    //                   0,
    //                 ],
    //               },
    //               {
    //                 $multiply: [{ $toDouble: "$FeeRate" }, "$unpaidCount"],
    //               },
    //               { $toDouble: "$Due" },
    //             ],
    //           },
    //         },
    //       },
    //       {
    //         $set: {
    //           PayMonths: {
    //             $map: {
    //               input: "$PayMonths",
    //               as: "month",
    //               in: {
    //                 monthName: "$$month.monthName",
    //                 status: "unpaid",
    //               },
    //             },
    //           },
    //           "Tarabi.status": "unpaid",
    //         },
    //       },
    //       { $unset: "unpaidCount" },
    //     ])
    //     .then((result) => {
    //       if (result.matchedCount === 0) {
    //         res.status(404).send({ message: "User not found" });
    //       } else {
    //         res.send({
    //           message: "Year closed for user!",
    //           modifiedCount: result.modifiedCount,
    //         });
    //       }
    //     })
    //     .catch((err) => {
    //       console.error(err);
    //       res.status(500).send({ error: "Something went wrong" });
    //     });
    // });
    const closeYear = async () => {
      return userCollection2.updateMany({}, [
        {
          $set: {
            unpaidCount: {
              $size: {
                $filter: {
                  input: "$PayMonths",
                  as: "m",
                  cond: { $eq: ["$$m.status", "unpaid"] },
                },
              },
            },
          },
        },
        {
          $set: {
            prevYear: {
              PayMonths: "$PayMonths",
              Tarabi: "$Tarabi",
              FeeRate: "$FeeRate",
              Due: {
                $add: [
                  {
                    $cond: [
                      { $eq: ["$Tarabi.status", "unpaid"] },
                      { $toDouble: "$Tarabi.fee" },
                      0,
                    ],
                  },
                  {
                    $multiply: [{ $toDouble: "$FeeRate" }, "$unpaidCount"],
                  },
                  { $toDouble: "$Due" },
                ],
              },
            },
          },
        },
        {
          $set: {
            Due: {
              $add: [
                {
                  $cond: [
                    { $eq: ["$Tarabi.status", "unpaid"] },
                    { $toDouble: "$Tarabi.fee" },
                    0,
                  ],
                },
                {
                  $multiply: [{ $toDouble: "$FeeRate" }, "$unpaidCount"],
                },
                { $toDouble: "$Due" },
              ],
            },
          },
        },
        {
          $set: {
            PayMonths: {
              $map: {
                input: "$PayMonths",
                as: "month",
                in: {
                  monthName: "$$month.monthName",
                  status: "unpaid",
                },
              },
            },
            "Tarabi.status": "unpaid",
          },
        },
        { $unset: "unpaidCount" },
      ]);
    };

    cron.schedule(
      "57 12 13 12 *",
      async () => {
        try {
          console.log("⏰ Auto year closing started...");
          const result = await closeYear();
          console.log("✅ Auto year closing done:", result.modifiedCount);
        } catch (err) {
          console.error("❌ Auto year closing failed", err);
        }
      },
      {
        timezone: "Asia/Dhaka",
      }
    );
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
