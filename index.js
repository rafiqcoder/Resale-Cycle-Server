const express = require('express');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { MongoClient,ServerApiVersion,ObjectId } = require('mongodb');

const app = express();

app.use(express.json());
app.use(cors());
const stripe = require("stripe")(`${process.env.STRIPE_SECRET_KEY}`);

app.use(express.static("public"));

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
    const Categories = client.db('ResaleCycle').collection('categories');
    const Products = client.db('ResaleCycle').collection('products');
    const AdvertisedProducts = client.db('ResaleCycle').collection('advertised');
    const Bookings = client.db('ResaleCycle').collection('bookings');
    const ReportedItems = client.db('ResaleCycle').collection('reportedItems');
    const Payments = client.db('ResaleCycle').collection('payments');

    const verifyAdmin = async (req,res,next) => {
        const email = req.query.email;

        const user = await UserList.findOne({ email: email });
        if (user.role === 'admin') {

            next();
        } else {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
    }
    try {
        app.get('/admin/:email',verifyJWT,async (req,res) => {
            const { email } = req.params;

            const decoded = req.decoded;
            if (decoded.email === email) {
                const user = await UserList.findOne({ email: email })

                if (user.role === 'admin') {
                    return res.send({ message: 'success' })
                }

                return res.status(403).send({ message: 'forbidden' })

            }
            res.status(403).send({ message: 'Forbidden' })

        })

        app.post('/payments',async (req,res) => {
            const data = req.body;
            const id = data.booking_id;
            const productId = data.product_id;
            const booking = await Bookings.updateOne({ _id: ObjectId(id) },{ $set: { status: 'paid' } });
            const products = await Products.updateOne({ _id: ObjectId(productId) },{ $set: { status: 'paid' } });
            const advertisedProducts = await AdvertisedProducts.deleteOne({ _id: productId });

            const result = await Payments.insertOne(data);
            console.log(result);
            return res.send(result);

        });
        app.get('/checkout/:id',async (req,res) => {
            const { id } = req.params;
            const query = { _id: ObjectId(id) }
            const result = await Bookings.findOne(query);
            res.send(result)
            // console.log(result);
        })

        app.post("/create-payment-intent",async (req,res) => {
            const { price } = req.body;
            console.log(price);
            // const amount = booking.salePrice;
            const amount = price * 100;
            console.log(amount);
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                // automatic_payment_methods: {
                //     enabled: true,
                // },
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/report',async (req,res) => {
            const data = req.body;
            // console.log(user.email);
            const result = await ReportedItems.insertOne(data);
            console.log(result);
            return res.send(result);

        });

        app.get('/report',async (req,res) => {
            const email = req.query.email;
            const result = await ReportedItems.find({}).toArray();
            return res.send(result);
        });
        app.delete('/report/:id',async (req,res) => {
            const id = req.params.id;
            console.log(id);
            const query = { _id: id };
            const result = await ReportedItems.deleteOne(query);
            console.log(result);
            res.send(result);
        })
        app.post('/booking',async (req,res) => {
            const data = req.body;

            // console.log(user.email);
            const id = data.product_id;
            const query = { buyerEmail: data.buyerEmail,product_id: id };
            const userBookings = await Bookings.find(query).toArray();
            if (userBookings.length === 0) {


                const result = await Bookings.insertOne(data);

                return res.send(result);
            }

            return res.status(403).send({ message: 'Already Booked' })
        });
        app.get('/booking',verifyJWT,async (req,res) => {
            const email = req.query.email;
            const decoded = req.decoded;
            if (decoded.email !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { buyerEmail: email };
            const result = await Bookings.find(query).toArray();
            return res.send(result);
        });

        app.post('/add-category',async (req,res) => {
            const data = req.body;
            // console.log(user.email);
            const result = await Categories.insertOne(data);
            return res.send(result);
        });

        app.post('/add-Product',async (req,res) => {
            const product = req.body;
            const result = await Products.insertOne(product);
            return res.send(result);
            // console.log(result);

        });
        app.post('/advertise',verifyJWT,async (req,res) => {
            const product = req.body;
            const email = req.query.email;
            const decoded = req.decoded;
            const id = product._id;
            const query = { _id: ObjectId(id) };
            const query2 = { _id: id };
            if (decoded.email !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const productExist = await AdvertisedProducts.find({}).toArray();

            const alreadyAdvertised = productExist.find(product => product._id === id);
            // console.log(alreadyAdvertised.length);

            if (alreadyAdvertised) {
                return res.send({ message: 'Already Advertised' });

            }
            const updateProduct = await Products.updateOne(query,{ $set: { status: 'advertised' } });
            const result = await AdvertisedProducts.insertOne(product);
            return res.send(result);

        });
        app.get('/advertise',async (req,res) => {
            const product = req.body;


            const result = await AdvertisedProducts.find({}).toArray();

            // console.log(unsold);

            return res.send(result);

        });

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
                const token = jwt.sign({ email },process.env.ACCESS_SECRET_TOKEN,{ expiresIn: '7d' });
                console.log(token);
                return res.send({ accessToken: token });
            }
        });
        app.get('/allbuyers',verifyJWT,async (req,res) => {
            const email = req.query.email;
            const decoded = req.decoded;
            if (decoded.email === email) {
                const users = await UserList.find({}).toArray()
                const buyers = users.filter(user => user.userType === 'buyer');
                // console.log(buyers);
                return (res.send(buyers))
            }
            res.status(403).send({ message: 'Forbidden' })
        })
        app.get('/veloce',async (req,res) => {
            const email = req.query.email;

            const products = await Products.find({}).toArray()
            const veloceProducts = products.filter(product => product.category === 'veloce');

            res.send(veloceProducts)
        })
        app.get('/:name/:id',async (req,res) => {
            const id = req.params.id;
            const name = req.params.name;
            const query = { _id: ObjectId(id) };

            const categories = await Categories.find({}).toArray();
            const category = categories.find(category => category.categoryName === name);


            const products = await Products.find({}).toArray();
            const catProducts = products.filter(product => product.category === name && product.status !== 'paid');

            res.send({
                products: catProducts,
                category: category
            })
        })

        app.get('/my-products',async (req,res) => {
            const email = req.query.email;

            const query = { email: email };
            const products = await Products.find(query).toArray()
            res.send(products)
        })
        app.get('/all-categories',async (req,res) => {

            const categories = await Categories.find({}).toArray()
            res.send(categories)
        })

        app.get('/allusers',async (req,res) => {
            // const email = req.query.email;
            const users = await UserList.find({}).toArray()
            res.send(users)
        })

        app.get('/allsellers',verifyJWT,async (req,res) => {
            const email = req.query.email;
            const decoded = req.decoded;
            if (decoded.email === email) {
                const users = await UserList.find({}).toArray()
                const buyers = users.filter(user => user.userType === 'seller');
                // console.log(buyers);
                return (res.send(buyers))
            }
            res.status(403).send({ message: 'Forbidden' })

        })
        app.delete('/my-products/:id',async (req,res) => {
            const id = req.params.id;

            const query = { _id: ObjectId(id) };
            const query2 = { _id: id };
            console.log(query2);
            const result = await Products.deleteOne(query);
            const result2 = await AdvertisedProducts.deleteOne(query2);
            res.send(result);
        })
        app.delete('/allbuyers/:id',verifyAdmin,async (req,res) => {
            const id = req.params.id;

            const query = { _id: ObjectId(id) };
            const result = await UserList.deleteOne(query);
            res.send(result);
        })

        app.delete('/allselllers/:id',verifyAdmin,async (req,res) => {
            const id = req.params.id;

            const query = { _id: ObjectId(id) };
            const result = await UserList.deleteOne(query);
            res.send(result);
        })

        app.patch('/allselllers/:id',async (req,res) => {
            const id = req.params.id;

            const query = { _id: ObjectId(id) };
            const update = { $set: { verified: true } };
            const result = await UserList.updateOne(query,update);
            res.send(result);
        })

    } finally {

    }

}
run().catch(console.dir);


app.listen(port,() => {
    console.log(`Server is running on port: ${port}`);
})