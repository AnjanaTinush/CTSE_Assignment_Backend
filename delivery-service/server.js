require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 3004;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Delivery Service running on port ${PORT}`);
    });
});
