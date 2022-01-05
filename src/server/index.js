import express from "express"
import glob from "glob"
import fs from "fs"
import path from "path"
import cors from "cors"

const app = express()

app.use(cors())

app.get("/", (req, res) => {
    res.redirect("/manifest.txt")
})

app.get("/manifest.txt", (req, res) => {
    glob("**/*.js", { cwd: "out" }, (_, matches) => {
        let fileRes = ""
        for (var file of matches) {
            fileRes += `/${file}\n`
        }
        res.send(fileRes)
    })
})

app.get("**/*.js", (req, res) => {
    fs.readFile(path.join("out", req.path), function (err, data) {
        if (err) {
            res.sendStatus(404)
            return
        }

        // We want to do a replacement so bitburner can import
        const regex = /(import.*from\s{1})[\'\"]\.\/(.*)[\'\"]\;/g
        let resStr = data.toString()
        var newRes = resStr.replaceAll(regex, "$1'/$2.js';")

        res.send(newRes)
    })
})

app.listen(3000, () => {
    console.log("The application is listening on port 3000!")
})
