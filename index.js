const express = require('express')
require('dotenv').config()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express()
const port = process.env.PORT || 5000



// middleware
app.use(
  cors({
    origin:['http://localhost:5173','https://teach-em-client-site.vercel.app'],
    credentials: true
  })
)
app.use(express.json())
app.use(cookieParser())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1kmrgvs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const classessCollection = client.db('TeachEmDB').collection('classess')
    const feedbacksCollection = client.db('TeachEmDB').collection('feedbacks')
    const assignmentsCollection = client.db('TeachEmDB').collection('assignment')
    const submitAssignmentsCollection = client.db('TeachEmDB').collection('submitAssignment')
    const usersCollection = client.db('TeachEmDB').collection('users')
    const requesteCollection = client.db('TeachEmDB').collection('requeste')
    const paymentCollection = client.db('TeachEmDB').collection('payment')



    //========= jwt token related api part start =================
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' });
      res.cookie('token',token,{
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
      .send({ success: true })
    })

    app.post('/logout', async(req, res)=>{
      const user = req.body
      res.clearCookie('token', {maxAge: 0}).send({ success: true })
    })

    // middlewares 
    const verifyToken = async (req, res, next)=>{
      const token = req.cookies?.token
      console.log(token, 'line 63');
      if(!token){
        return res.status(401).send('Unauthorized access')
      }
      jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(error,decoded)=>{
        if(error){
          return res.status(403).send({
            message:'forbidden access'
          })
        }
        req.decoded = decoded
        next()
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
    //========= jwt token related api part end ===================



    // ============= payment related api part start ======================
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseInt(price) * 100;
      if (!price || priceInCent < 1) return;

      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret });

    })

    app.post('/payment', async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);

      const classId = paymentData.classId;
      const query = { _id: new ObjectId(classId) };
      const updateDoc = {
        $inc: { total_enrolment: 1 },
      };
      const updatePayment = await classessCollection.updateOne(query, updateDoc);
      res.send({ result, updatePayment });
    })

    app.get('/payment-my-enroll/api/get/:email', async (req, res) => {
      const email = req.params.email
      const query = { paymentUserEmail: email }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })


    app.get('/payment-myEnroll-details/api/get/:id', async (req, res) => {
      const id = req.params.id
      const query = {_id: new ObjectId(id) }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })
    // ============= payment related api part end ======================






    // ============= user related api part start ======================
    // app.post('/user/api/create', async (req, res) => {
    //   const item = req.body
    //   const result = await usersCollection.insertOne(item)
    //   res.send(result)
    //   console.log(result,'lien---> 126');
    // })

    app.put('/user/api/create', async (req, res) => {
      const user = req.body
      const query = { email: user?.email }
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        if (user.status === 'Requested') {
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          })
          return res.send(result)
        } else {
          return res.send(isExist)
        }
      }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      }
      const result = await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })


    app.get('/user/api/get', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })


    app.get('/user/api/get/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    app.get('/user/role/api/get/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email: email });
      res.send(result);
  });

    app.patch('/user/api/role/update/:id', async (req, res) => {
      const id = req.params.id;
      const updateData = req.body
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...updateData
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })


    app.patch('/user/api/role/:email', async (req, res) => {
      const email = req.params.email;
      const updateData = req.body
      const filter = { email: email };
      const updatedDoc = {
        $set: {
          ...updateData
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // ============= user related api part end ========================




    // ============= classess related api part start ======================
    app.post('/class/api/create', async (req, res) => {
      const item = req.body
      const result = await classessCollection.insertOne(item)
      res.send(result)
    })


    // ok..
    app.get('/higest/enroll-class/api/get', async (req, res) => {
      const result = await classessCollection.find().toArray()
      res.send(result)
    })

    app.get('/class/api/status/get', async (req, res) => {
      const result = await classessCollection.find({ status: "acceped" }).toArray()
      res.send(result)
    })

    app.get('/class/api/get/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await classessCollection.findOne(query)
      res.send(result)
    })

    app.get('/teacherClass/api/get/:email', async (req, res) => {
      const email = req.params.email
      const query = { teacherEmail: email }

      const result = await classessCollection.find(query).toArray()
      res.send(result)
    })

    app.delete('/class/api/delete/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await classessCollection.deleteOne(query)
      res.send(result)
    })


    app.put('/class/api/updated/:id', async (req, res) => { //ok
      const id = req.params.id
      const updateData = req.body
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...updateData
        }
      };
      const result = await classessCollection.updateOne(filter, updateDoc, options)
      res.send(result)
    })

    app.patch('/class/api/status/update/:id', async (req, res) => {
      const id = req.params.id;
      const updateData = req.body
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...updateData
        }
      }
      const result = await classessCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    //ok..
    app.get('/totalData/count/related/api', async (req, res) => {
     
        const user = await usersCollection.estimatedDocumentCount();
        const classes = await classessCollection.estimatedDocumentCount();
        const enroll = await paymentCollection.estimatedDocumentCount();
        res.send({
          user,
          classes,
          enroll
        });
    
    });
    // ============= classess related api part end ========================






    // ============= feedback related api part start ======================
    app.post('/feedback/api/create', async (req, res) => {
      const feedbackData = req.body
      const result = await feedbacksCollection.insertOne(feedbackData)
      res.send(result)
    })
    app.get('/all-feedback/api/get', async (req, res) => {
      const result = await feedbacksCollection.find().toArray()
      res.send(result)
    })
    app.get('/feedbackData/api/get/:id', async (req, res) => {
      const id = req.params.id;
      const query = { feedbackId: id };
      const result = await feedbacksCollection.find(query).toArray();
      res.send(result);
    });
    // ============= feedback related api part end ========================



    // totalEnroll/totalAssignmentPost/totalSubmitPost related api part start ====================
    // app.get('/total-enrolment/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const query = { classId: id};

    //   const totalEnrolment = await paymentCollection.countDocuments(query);
    //   res.send({ totalEnrolment });
    //   console.log(totalEnrolment);
    // });

    app.get('/teacher-assignment-post/related/api/:id' , async (req,res) => {
      const id = req.params.id
      const query = { SeeDetailsId: id };

      const totalAssignmentPost = await assignmentsCollection.countDocuments(query)
      res.send({totalAssignmentPost})
    })

    app.get('/student-enroll-class/related/api/:id' , async (req,res) => {
      const id = req.params.id
      const query = { classId: id };
    
      const totalEnrollClass = await paymentCollection.countDocuments(query)
      res.send({totalEnrollClass})
    })
    // totalEnroll/totalAssignmentPost/totalSubmitPost related api part end ======================






    // ============= requested related api part start ======================
    app.post('/requested/api/create', async (req, res) => {
      const item = req.body
      const result = await requesteCollection.insertOne(item)
      res.send(result)
    })

    app.patch('/requested/api/role/update/:id', async (req, res) => {
      const id = req.params.id;
      const updateData = req.body
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          ...updateData
        }
      }
      const result = await requesteCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.get('/all-requested/api/get', async (req, res) => {
      const result = await requesteCollection.find().toArray()
      res.send(result)
    })

    app.get('/requested/api/create/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      const result = await requesteCollection.findOne(query)
      res.send(result)
    })
    // ============= requested related api part end =============================


    // ============= assignment related api part start =========================
    app.post('/assignment/api/create', async (req, res) => {
      const item = req.body
      const result = await assignmentsCollection.insertOne(item)
      res.send(result)
    })

    // app.get('/assignment/api/get', async (req, res) => {
    //   const result = await assignmentsCollection.find().toArray()

      
    //   const totalAssignmentPost = await assignmentsCollection.countDocuments(result)
    //   console.log({totalAssignmentPost});
    //   // res.send(result)
    // })

    // app.get('/assignment/api/get/:id', async (req, res) => {
    //   const id = req.params.id
    //   const query = { classId: id }
    //   const result = await assignmentsCollection.find(query).toArray()
    //   res.send(result)
    // })
    // ============= assignment related api part end ===========================




    // await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('TeachEm server')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})