const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require("mongodb");
const admin = require("firebase-admin")
require('dotenv').config()
const app = express();
const port = process.env.PORT || 3000;


const serviceAccount = require("./models-hub-firebase-admin-sdk.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


app.use(cors());
app.use(express.json());


// Verify and Secure Server Side 
const verifyFirebaseToken = async (req, res, next) => {

    if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    try {
        const userInfo = await admin.auth().verifyIdToken(token);
        req.token_email = userInfo.email;
        console.log("userInfo: ", userInfo)
        next();
    }
    catch {
        return res.status(401).send({ message: 'unauthorized access' })
    }
}

// Root route for testing server
app.get("/", (req, res) => {
    res.send("3D Model Hub Server is going on");
})


const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@clustersm.e6uuj86.mongodb.net/?appName=ClusterSM`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        await client.connect();

        // MongoDB Collection connect

        const modelDB = client.db("models-hub");
        const modelCollection = modelDB.collection("models");
        const downloadCollection = modelDB.collection("downloads")

        // Get Method 
        app.get("/model", async (req, res) => {
            const query = {}
            const cursor = modelCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // Get Method Special Case With Id
        app.get("/model/:id", verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await modelCollection.findOne(query);
            res.send(result);
        });

        // Latest 6 Model 
        app.get("/latest-model", async (req, res) => {
            console.log(res)
            const cursor = modelCollection.find().sort({ created_at: -1 }).limit(6);
            const result = await cursor.toArray();
            res.send(result);
        });


        //Post Method
        app.post("/model", async (req, res) => {
            const newModel = req.body
            const result = await modelCollection.insertOne(newModel)
            res.send(result)
        })

        // Get - My Download
        app.get("/my-downloads", verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.downloaded_by = email;
                if (email !== req.token_email) {
                    return res.status(403).send({ message: "forbidden access" })
                }
            }
            const cursor = downloadCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        // Post Method for Download
        // app.post("/downloads", verifyFirebaseToken, async (req, res) => {
        //     const data = req.body
        //     const result = await downloadCollection.insertOne(data)
        //     res.send(result)
        // })

        // Post Method for Download
        app.post("/downloads", verifyFirebaseToken, async (req, res) => {
            try {
                const data = req.body;
                const modelId = data._id;

                if (!modelId) {
                    return res.status(400).send({ success: false, message: "Model ID missing" });
                }
                const { _id, ...downloadData } = data;
                const result = await downloadCollection.insertOne(downloadData);

                const filter = { _id: new ObjectId(modelId) };
                const update = { $inc: { downloads: 1 } };
                const updated = await modelCollection.findOneAndUpdate(
                    filter,
                    update,
                    { returnDocument: "after" }
                );

                res.send({
                    success: true,
                    message: "Download recorded and count updated",
                    result,
                    updatedModel: updated.value,
                });
            } catch (error) {
                console.error("Download error:", error);
                res.status(500).send({ success: false, message: "Download update failed", error });
            }
        });


        // Patch Method
        app.patch("/model/:id", verifyFirebaseToken, async (req, res) => {
            try {
                const id = req.params.id;
                const updateModel = req.body;
                const query = { _id: new ObjectId(id) };

                const update = {
                    $set: {
                        name: updateModel.name,
                        category: updateModel.category,
                        description: updateModel.description,
                        thumbnail: updateModel.thumbnail,
                    },
                };

                const options = {}; // optional, MongoDB default options
                const result = await modelCollection.updateOne(query, update, options);

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: err.message });
            }
        });

        // Delete Method 
        app.delete("/model/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await modelCollection.deleteOne(query);
            res.send(result);
        });

        // My Models API
        app.get("/my-models", verifyFirebaseToken, async (req, res) => {
            // console.log(req.query);
            const email = req.query.email;
            const query = {};
            if (email) {
                query.created_by = email;
                if (email !== req.token_email) {
                    return res.status(403).send({ message: "forbidden access" })
                }
            }
            const cursor = modelCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });

        // Search
        app.get("/search", async (req, res) => {
            const search_text = req.query.search
            const result = await modelCollection.find({ name: { $regex: search_text, $options: "i" } }).toArray()
            res.send(result)
        })


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // await client.close();
    }
}
run().catch(console.dir)

// Server listen
app.listen(port, () => {
    console.log(`Simple Deals Server at port: ${port}`)
});
