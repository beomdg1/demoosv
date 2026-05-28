require('dotenv').config()



const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { Pool } = require('pg')
const app = express();
const cors = require("cors");
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'app')))

const PORT = process.env.PORT || 3000

// PostgreSQL connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
        rejectUnauthorized: false
    }
})


app.get('/api/getdata', async (req, res) => {

    try {

        const result = await pool.query('select * from backup_logs ORDER BY created_at DESC')

        res.json({
            success: true,
            data: result.rows
        })

    } catch (err) {

        console.log(err)

        res.status(500).json({
            success: false,
            error: err.message
        })
    }

})

app.post('/api/backup', async (req, res) => {

    try {

        const data = req.body

        await pool.query(`
            INSERT INTO backup_logs (
                hospital_code,
                file_name,
                backup_date,
                backup_size,
                disk_free,
                disk_total,
                disk_percent,
                host
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, [
            data.HospitalCode,
            data.FileName,
            data.BackupDate,
            data.BackupSize,
            data.DiskFree,
            data.DiskTotal,
            data.DiskPercent,
            data.Host
        ])

        res.json({
            success: true,
            message: 'Backup saved'
        })

    } catch (err) {

        console.log(err)

        res.status(500).json({
            success: false,
            error: err.message
        })
    }

})



app.listen(PORT, () => {
    console.log(`Server running port ${PORT}`)
})