const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'https://islampur-jame-masjid.vercel.app'],
}
app.use(cors(corsOptions))
app.use(express.json());

const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6cld7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    app.get("/admin/:number", async (req, res) => {
      const number = req.params.number
      const query = {number: number}
      const result = await adminCollection.findOne(number);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query= {_id: new ObjectId(id)};
      const result = await userCollection.findOne(query)
      res.send(result);
    });

    app.post('/addUser', async (req, res) => {
      const addedUser = req.body;
      console.log(addedUser);
      const result = await userCollection.insertOne(addedUser);
      res.send(result);
  })

  // editing fees 

  app.patch('/editFee/:id', async (req,res)=>{
    const id= req.params.id;
    const editFee = req.body;
    const query = {_id: new ObjectId(id)};
    const updatedDoc = {
      $set:{
        FeeRate: editFee.FeeRate,
        'Tarabi.fee': editFee.TarabiFee,
        Due: editFee.DueFee
      }
    }
    const result = await userCollection.updateOne(query, updatedDoc);
    res.send(result)
  })

  // edit month status to paid
  app.patch('/monthStatus', async(req,res)=>{
    const {id, monthName} = req.body;
    const query = {_id: new ObjectId(id), "PayMonths.monthName": monthName};
    const result = await userCollection.updateOne(query, {
      $set:{"PayMonths.$.status": "paid"}
    })
    res.send(result)
  })

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
