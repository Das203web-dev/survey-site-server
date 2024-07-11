const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.VITE_PAYMENT);

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


        // verify token middleware 
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "Access Denied" });
            }
            const token = req.headers.authorization.split(" ")[1];
            console.log(token);
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    res.status(401).send({ message: "Access not granted" })
                }
                console.log(decoded, 'line 50');
                req.decode = decoded;
                next();
            })
        }

        const verifySuperAdmin = async (req, res, next) => {
            try {
                const email = req.decode?.email;
                console.log("Decoded email from token:", email); // Check the email being verified
                if (!email) {
                    console.log("Email not found in decoded token");
                    return res.status(401).send({ message: "Invalid token, no email" });
                }

                // Check if the email matches the Super Admin email
                if (email !== process.env.SUPER_ADMIN_EMAIL) {
                    console.log("User is not a Super Admin");
                    return res.status(403).send({ message: "Forbidden access" });
                }

                console.log("User is Super Admin");
                next();
            } catch (error) {
                console.error("Error in verifySuperAdmin middleware:", error);
                if (!res.headersSent) {
                    return res.status(500).send({ message: "Internal Server Error" });
                }
            }
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            // console.log(email, 'line 96');
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === "Admin";
            if (!isAdmin) {
                return res.status(401).send({ message: "forbidden access" })
            }
            next()
        }

        // jwt related api 
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            // console.log(user, 'line 97');
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
                expiresIn: '1h'
            })
            res.send({ token })
        })

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
            const result = await surveyCollection.insertOne(fina);
            res.send(result);

        });
        app.patch("/survey/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const filter = await surveyCollection.findOne(query);
            const totalVotes = filter.total_votes || 0;
            const updateVotes = totalVotes + 1;
            const updateDoc = {
                $set: {
                    total_votes: updateVotes
                }
            }
            const updatedData = await surveyCollection.updateOne(filter, updateDoc);
            res.send(updatedData)
        })
        // PAYMENT APIS 
        app.post("/create_payment_intent", async (req, res) => {
            const { price } = req.body;
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
        app.delete('/userData/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id, 'line 217');
            const query = { _id: new ObjectId(id) };
            const filter = await userData.deleteOne(query);
            res.status(200).send(filter)
        })

        app.post("/paid_user_data", verifyToken, async (req, res) => {
            const checkData = req.body;
            const email = checkData.email;

            try {
                // Insert paid user data
                const insertData = await paidUserData.insertOne(checkData);

                if (!insertData.acknowledged) {
                    return res.status(500).send({ message: "Failed to insert paid user data" });
                }
                // Find the user in userData collection
                const previousUser = await userData.findOne({ email: email });

                if (!previousUser) {
                    return res.status(404).send({ message: "User not found in userData" });
                }

                // Update user data with role "pro_user"
                const updateInfo = { $set: { role: "pro_user" } };
                const result = await userData.updateOne({ email: email }, updateInfo);

                if (result.modifiedCount > 0) {
                    return res.status(200).send({ message: "User upgraded to pro user" });
                } else {
                    return res.status(500).send({ message: "Failed to update user role" });
                }
            } catch (error) {
                console.error("Error in /paid_user_data endpoint:", error);
                // Ensure we only send a single response
                if (!res.headersSent) {
                    return res.status(500).send({ message: "Internal Server Error" });
                }
            }
        });

        app.get("/paid_user_data/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const filter = await paidUserData.findOne(query);
            res.send(filter)
        })

        // testing api for posting user info 

        app.get('/super-admin/:email', async (req, res) => {
            const email = req.params.email;
            let superAdmin = false
            if (email === process.env.SUPER_ADMIN_EMAIL) {
                superAdmin = true
            }
            else {
                // console.log('not matched');
                superAdmin = false
            }
            res.status(200).send(superAdmin)
        });
        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            // console.log(email, "line 303");
            let admin = false
            const query = { email: email };
            const result = await userData.findOne(query);
            // console.log(result, "line 307");
            if (result?.role === "Admin") {
                admin = true
            }
            else {
                admin = false
            }
            res.send(admin)
        })

        app.patch("/user/admin/:email", verifyToken, verifySuperAdmin, async (req, res) => {
            const email = req.params.email;
            // console.log(email, 'line 305');
            try {
                const query = { email: email };
                const getUser = await userData.findOne(query);
                if (!getUser) {
                    return res.status(404).send({ message: "User not found" });
                }
                const updateDoc = {
                    $set: {
                        role: "Admin"
                    }
                };
                const result = await userData.updateOne({ email: email }, updateDoc);
                res.status(200).send(result);
            } catch (error) {
                console.error("Error updating user role:", error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });
        app.get("/user/admin", async (req, res) => {
            const role = 'Admin';
            const query = { role: role };
            const findAdmin = await userData.find(query).toArray();
            res.status(200).send(findAdmin)
        })


        app.post("/userData", async (req, res) => {
            const body = req.body;
            const checkEmail = { email: body.email }
            const check = await userData.findOne(checkEmail);
            if (!check) {
                const result = await userData.insertOne(body);
                res.send(result)
            }
            else {
                res.status(200).send({ message: "user already exist" })
            }
        });
        app.get("/userData", async (req, res) => {
            const email = await userData.find().toArray();
            res.send(email);
        })
        app.post("/votedSurveyData", async (req, res) => {
            const data = req.body;
            const result = await votedData.insertOne(data);
            res.status(200).send(result)
        })
        app.get("/votedSurveyData", async (req, res) => {
            const allData = await votedData.find().toArray();
            res.status(200).send(allData)
        })
        app.post("/comments", verifyToken, async (req, res) => {
            const commentBody = req.body;
            commentBody.timestamp = new Date().toISOString()
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
        app.patch("/comment/:id", async (req, res) => {
            const commentId = req.params.id;
            console.log(commentId, 'line 326');
            const newComment = req.body.comment;
            console.log(newComment, 'line 327');
            const query = { _id: new ObjectId(commentId) };
            const newTimeStamp = newComment.timestamp = new Date().toISOString()

            // const filter = await commentCollection.findOne(query);
            // console.log(filter, 'line 328');
            const updateDoc = {
                $set: {
                    comment: newComment,
                    timestamp: newTimeStamp
                }
            }
            const result = await commentCollection.updateOne(query, updateDoc);
            console.log(result, 'line 336');
            res.status(200).send(result)

        })
        app.delete("/comment/:id", async (req, res) => {
            const commentId = req.params.id;
            // console.log(commentId);
            const query = { _id: new ObjectId(commentId) }
            const filter = await commentCollection.deleteOne(query);
            res.status(200).send({ message: "Deleted successfully" })
        })

        app.get('/vote-stats', verifyToken, async (req, res) => {
            try {
                const voteStats = await votedData.aggregate([
                    {
                        $lookup: {
                            from: 'surveyData',
                            localField: 'surveyId',
                            foreignField: '_id',
                            as: 'surveyInfo'
                        }
                    },
                    {
                        $unwind: '$surveyInfo'
                    },
                    {
                        $group: {
                            _id: '$surveyInfo.category',
                            votes: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            category: '$_id',
                            votes: '$votes'
                        }
                    }
                ]).toArray();
                res.send(voteStats);
            } catch (error) {
                console.error("Error fetching vote stats:", error);
                res.status(500).send({ message: "Internal Server Error" });
            }
        });




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