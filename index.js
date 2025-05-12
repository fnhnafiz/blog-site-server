const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const port = process.env.PORT || 5000;
const app = express();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://ephemeral-profiterole-ff69db.netlify.app",
  ],
  credentials: true,
  optionalSuccessStatus: 200,
};

// midleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.udh1k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify token with middleware with cookie parser
const verifyToken = (req, res, next) => {
  // req.Nh = "I am WishList";
  const token = req.cookies?.token;
  console.log("I am Verify", token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Domain" });
  }
  jwt.verify(token, process.env.SECRET_KEY, (error, decoded) => {
    if (error) {
      console.log("I am Error", error);
      return res.status(401).send({ message: "UnAuthorized Domanin" });
    }

    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const blogsCollection = client.db("Blogs-Site").collection("blog");
    const wishlistCollection = client.db("Blogs-Site").collection("wishlist");
    const commentCollection = client.db("Blogs-Site").collection("comment");

    // Create JWT for user
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      console.log(email);
      // create token
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "365d",
      });
      // console.log(token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // when log out a user token will remove the browser in cookies;
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // show all blog data
    app.post("/add-blog", async (req, res) => {
      const blogData = req.body;
      const result = await blogsCollection.insertOne(blogData);
      res.send(result);
    });

    // check user for verify token with jwt
    app.get("/check-user", verifyToken, async (req, res) => {
      const email = req.query?.email;
      const decodedEMail = req.user?.email;
      // console.log("email from user token", decodedEMail);
      // console.log("email from params", email);
      if (decodedEMail !== email) {
        return res.status(401).send({ message: "unauthorized domain" });
      }
    });

    // comment for apis
    app.post("/add-comment", async (req, res) => {
      const comment = req.body;
      // const allReadyExist = await blogsCollection.findOne(id);
      const alreadyExist = await blogsCollection.findOne({
        _id: new ObjectId(comment.blogId),
        buyerInfo: comment.buyerInfo,
      });
      if (alreadyExist) {
        return res.status(400).send({ message: "Can not comment on own blog" });
      }
      const result = await commentCollection.insertOne(comment);
      res.send(result);
    });

    app.get("/blog-comments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { blogId: id };
      // console.log("Query:", query);

      // Fetch the comments for the given blogId
      const comments = await commentCollection.find(query).toArray();

      // Send the fetched comments as the response
      res.send(comments);
    });

    app.get("/all-blogs", async (req, res) => {
      const filter = req.query.category;
      const search = req.query.search;
      console.log(filter);
      let query = {};
      if (search) {
        query.title = { $regex: search, $options: "i" };
      }
      if (filter) {
        query.category = filter;
      }
      const result = await blogsCollection.find(query).toArray();
      res.send(result);
    });

    // sort limit in 6 data in home apis
    app.get("/blogs-limit", async (req, res) => {
      const result = await blogsCollection.find().limit(6).toArray();
      res.send(result);
    });

    app.get("/all-blogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogsCollection.findOne(query);
      res.send(result);
    });

    // // get a one data and update data from id base;
    app.put("/update-blog/:id", async (req, res) => {
      const id = req.params.id;
      const blogData = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedData = {
        $set: blogData,
      };
      const options = { upsert: true };
      const result = await blogsCollection.updateOne(
        query,
        updatedData,
        options
      );
      res.send(result);
    });

    // Watchlist
    app.post("/waishlist", async (req, res) => {
      // const id = { _id: new ObjectId(id) };
      const wishList = req.body;
      // console.log(wishList.id);
      const allReadyExist = await wishlistCollection.findOne({
        id: wishList.id,
        email: wishList.email,
      });
      if (allReadyExist) {
        return res.send({ message: "Already exist" });
      }
      const result = await wishlistCollection.insertOne(wishList);
      res.send(result);
    });

    app.get("/wishlist/:email", verifyToken, async (req, res) => {
      const decodedEMail = req.user?.email;
      const email = req.params.email;

      // console.log("email from user token", decodedEMail);
      // console.log("email from params", email);
      if (decodedEMail !== email) {
        return res.status(401).send({ message: "unauthorized domain" });
      }
      // Fetch the watchlist items for the given email
      const wishlistItems = await wishlistCollection.find({ email }).toArray();
      // console.log(wishlistItems);h
      // Prepare an array to store the detailed watchlist
      const wishlistDetails = [];

      for (const item of wishlistItems) {
        // Fetch details for each item
        const myWishlist = await blogsCollection.findOne({
          _id: new ObjectId(item.id),
        });
        if (myWishlist) {
          wishlistDetails.push(myWishlist);
        }
      }

      // Send the response with the detailed watchlist
      res.send(wishlistDetails);
    });

    // deleted wishlist
    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { id: id };
      const result = await wishlistCollection.deleteOne(query);
      console.log(result);
      res.send(result);
    });

    // feturers blog show in the apis

    app.get("/features-blogs", async (req, res) => {
      const blogs = await blogsCollection.find().toArray();

      // searching blogs to calculate long description length
      const featuresBlog = blogs
        .map((blog) => ({
          name: blog.buyerName,
          email: blog.buyerInfo,
          title: blog.title,
          longDescripntion: blog.longDescripntion,
          length: blog.longDescripntion?.length || 0,
          category: blog.category,
          sortDescription: blog.sortDescription,
          imageUrl: blog.imageUrl,
        }))
        .sort((a, b) => b.length - a.length)
        .slice(0, 10);

      res.send(featuresBlog);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Blog Website Server....");
});

app.listen(port, () =>
  console.log(`Blog Website Server running on port ${port}`)
);
