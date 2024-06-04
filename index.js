const express = require('express')
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const cors = require('cors');
const stripe = require("stripe")(process.env.VITE_PAYMENT)

app.use(express.json());
app.use(cors())



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sen9pye.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db('SurveyDB');
        const surveyCollection = database.collection('surveyData');
        const userData = database.collection("userData");
        const pricingCardData = database.collection("pricingCard");
        const paidUserData = database.collection("paidUserData");
        const votedData = database.collection("votedData");
        const commentCollection = database.collection("commentsData")

        app.get('/survey', async (req, res) => {
            const data = await surveyCollection.find().toArray();
            res.send(data)
        })
        app.get('/survey/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await surveyCollection.findOne(query);
            const category = { category: result.category };
            const similarCategory = await surveyCollection.find(category).toArray();
            const filteredData = similarCategory.filter(data => data._id.toString() !== query._id.toString());
            res.send({ result: result, category: filteredData })
        })
        app.get('/category/:category', async (req, res) => {
            const category = req.params.category;
            const query = { category: category }
            const result = await surveyCollection.find(query).toArray();
            res.send(result)
        })
        app.get('/pricingCard', async (req, res) => {
            const result = await pricingCardData.find().toArray();
            res.send(result)
        })
        app.get("/pricingCard/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await pricingCardData.findOne(query);
            res.send(result)
        })
        app.post('/survey', async (req, res) => {
            // try {
            const body = req.body;
            const timestamp = new Date();
            const zone = { timeZone: "Asia/Dhaka", hour12: true }; // Corrected timezone identifier
            const start_date = timestamp.toLocaleDateString('en-BD', zone);
            const start_time = timestamp.toLocaleTimeString('en-BD', zone);
            const surveyStartDate = { start_date, start_time }
            const fina = { ...body, surveyStartDate };
            // console.log("getting the body", fina);
            const result = await surveyCollection.insertOne(fina);
            res.send(result);
            // } catch (error) {
            //     console.error(error);
            //     res.status(500).json({ error: 'Internal Server Error' });
            // }
        });
        app.patch("/survey/:id", async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) };
            // console.log(query);
            // if (survey.voted_users && survey.voted_users.includes(userEmail)) {
            //     return res.status(400).send({ message: "User has already voted" });
            // }

            const filter = await surveyCollection.findOne(query);
            console.log(filter);
            const totalVotes = filter.total_votes || 0;
            console.log(totalVotes);
            const updateVotes = totalVotes + 1;
            const updateDoc = {
                $set: {
                    total_votes: updateVotes
                }
                // $push: { voted_users: userEmail }
            }
            const updatedData = await surveyCollection.updateOne(filter, updateDoc);
            console.log(updatedData);
            res.send(updatedData)
        })
        // PAYMENT APIS 
        app.post("/create_payment_intent", async (req, res) => {
            const { price } = req.body;
            console.log(req.body)

            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        app.post("/paid_user_data", async (req, res) => {
            const checkData = req.body;
            const email = checkData.email;
            // console.log(checkData);

            // Insert new paid user data
            const insertData = await paidUserData.insertOne(checkData);

            if (insertData.acknowledged) {
                // Find the user in userData collection
                const previousUser = await userData.findOne({ email: email });

                if (previousUser) {
                    // Update user data with role "pro_user"
                    const updateInfo = {
                        $set: {
                            role: "pro_user"
                        }
                    };
                    const result = await userData.updateOne({ email: email }, updateInfo);

                    if (result.modifiedCount > 0) {
                        res.send({ message: "User upgraded to pro user" });
                    } else {
                        res.status(500).send({ message: "Failed to update user role" });
                    }
                } else {
                    res.status(404).send({ message: "User not found in userData" });
                }
            } else {
                res.status(500).send({ message: "Failed to insert paid user data" });
            }
        });

        app.get("/paid_user_data/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const filter = await paidUserData.findOne(query);
            res.send(filter)
            // const filter = await 
        })


        // testing api for posting user info 
        app.post("/userData", async (req, res) => {
            const body = req.body;
            const result = await userData.insertOne(body);
            res.send(result)
        });
        app.get("/userData", async (req, res) => {
            const email = await userData.find().toArray();
            res.send(email);
        })
        app.post("/votedSurveyData", async (req, res) => {
            const data = req.body;
            console.log(data, "line 177");
            const result = await votedData.insertOne(data);
            res.status(200).send(result)
        })
        app.get("/votedSurveyData", async (req, res) => {
            const allData = await votedData.find().toArray();
            res.status(200).send(allData)
        })
        app.post("/comments", async (req, res) => {
            const commentBody = req.body;
            commentBody.timestamp = new Date().toISOString()
            console.log(commentBody);
            const response = await commentCollection.insertOne(commentBody);
            res.status(200).send(response)
        })
        app.get('/comment', async (req, res) => {
            const allComment = await commentCollection.find().toArray();
            res.status(200).send(allComment)
        })
        app.get('/comment/:id', async (req, res) => {
            const querySurveyId = req.params.id;
            const id = { surveyId: querySurveyId }
            const query = await commentCollection.find(id).toArray();
            res.send(query)
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("connected to mongodb");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('hi mongo')
})
app.listen(port, () => {
    console.log(`port is listening from  ${port}`)
})