require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 3003;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Order Service running on port ${PORT}`);
    });
});
