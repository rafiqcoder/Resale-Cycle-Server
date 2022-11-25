const express = require('express');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient,ServerApiVersion,ObjectId } = require('mongodb');

const app = express();

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1rvc7ql.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri,{ useNewUrlParser: true,useUnifiedTopology: true,serverApi: ServerApiVersion.v1 });

const verifyJWT = (req,res,next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorize Access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token,process.env.ACCESS_SECRET_TOKEN,function (err,decoded) {
        if (err) {
            res.status(403).send({ message: "Forbidden Access" })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {

    const UserList = client.db('ResaleCycle').collection('userList');

    try {

        app.post('/users',async (req,res) => {
            const user = req.body;
            console.log(user);
            // console.log(user.email);
            const query = { email: user.email }
            const existUser = await UserList.find(query).toArray();

            if (existUser.length === 0) {
                const result = await UserList.insertOne(user);

                return res.send(result);
                // console.log(result);
            }
        });
        app.get('/jwt',async (req,res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await UserList.findOne(query);
            if (user) {
                const token = jwt.sign({ email },process.env.ACCESS_SECRET_TOKEN,{ expiresIn: '1d' });
                return res.send({ accessToken: token });
            }
        });
        app.get('/allbuyers',verifyJWT,async (req,res) => {
            const email = req.query.email;
            const decoded = req.decoded;
            if (decoded.email === email) {
                const users = await UserList.find({}).toArray()
                const buyers = users.filter(user => user.userType === 'buyer');
                console.log(buyers);
                return (res.send(buyers))
            }
            res.status(403).send({ message: 'Forbidden' })

        })

    } finally {

    }

}
run().catch(console.dir);


app.listen(port,() => {
    console.log(`Server is running on port: ${port}`);
})