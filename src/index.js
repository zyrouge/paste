const express = require("express");
const languages = require("./assets/languages.json");
const logger = require("./utils/logger");
const config = require("./config");
const path = require("path");
const Enmap = require("enmap");

const server = express();
const bin = new Enmap({ name: "pastes", fetchAll: false, autoFetch: true });

server.use(require("express").json());
server.use(require("express").urlencoded({ extended: false }));
server.set("view engine", "ejs");
server.use(require("helmet")());
server.disable("x-powered-by");
server.set("views", path.join(__dirname, "pages"));
server.use("/assets", express.static(path.join(__dirname, "assets")));

server.get("/", (req, res) => {
    res.render("index.ejs");
});

server.get("/redirect/:link", (req, res) => res.redirect(`${config.root}/${req.params.link}`));

// Paste
// New
server.get("/paste/new", (req, res) => {
    res.render("paste-new.ejs", {
        languages
    });
});

server.post("/paste/new", (req, res) => {
    if (!req.body) return res.render("error.ejs", { error: "No content was passed" });
    if (!req.body.language) return res.render("error.ejs", { error: "No language was specified" });
    if (!req.body.code) return res.render("error.ejs", { error: "No code was pasted" });

    try {
        let pasteCode = randomCode(config.pasteCodeLen);
        if (!pasteCode) return res.render("error.ejs", { error: "Couldn\'t generate paste code" });

        do {
            pasteCode = randomCode(config.pasteCodeLen);
        } while (bin.has(pasteCode));

        bin.set(pasteCode, req.body);

        res.redirect("/paste/" + pasteCode);
    } catch (e) {
        res.status(500).render("error.ejs", { error: "Something went wrong at our end" });
        console.error(e);
    }
});

server.get("/paste/:code", (req, res) => {
    const paste = bin.get(req.params.code) || null;
    if (!paste) return res.render("error.ejs", { error: "Paste doesn\'t exist" });
    const fullLang = languages.find(lng => lng.code === paste.language) || "Unknown";
    res.render("paste-view.ejs", {
        languages,
        params: req.params,
        paste: { ...paste, fullLang }
    });
});

server.listen(config.port, () => logger.info(`Listening on PORT ${config.port}`));

function randomCode(length) {
    const characters = [..."abcdefghijklmnopqrstuvwxyz", ..."1234567890"];
    let output = "";
    for (let i = 0; i < length; i++) {
        output += (Math.random() >= 0.5 ? characters.random() : characters.random().toUpperCase());
    }
    return output;
}

Array.prototype.random = function () {
    return this[Math.floor(Math.random() * this.length)];
}