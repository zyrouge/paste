const express = require("express");
const languages = require("./assets/languages.json");
const logger = require("./utils/logger");
const config = require("./config");
const path = require("path");
const _ = require("lodash");
const Enmap = require("enmap");

const server = express();
const users = new Enmap({ name: "users", fetchAll: false, autoFetch: true });
const bin = new Enmap({ name: "pastes", fetchAll: false, autoFetch: true });
const defaults = {
    user (codes = [], cache = null) {
        return { codes, cache }
    },
    visibility () {
        return ["public", "unlisted", "private"];
    }
}

server.use(require("express").json());
server.use(require("express").urlencoded({ extended: false }));
server.set("view engine", "ejs");
server.use(require("helmet")());
server.disable("x-powered-by");
server.set("views", path.join(__dirname, "pages"));
server.use("/assets", express.static(path.join(__dirname, "assets")));

// Auth
const session = require("express-session");
const passport = require("passport");
passport.use(new (require("passport-github2").Strategy)({
    clientID: config.github.clientID,
    clientSecret: config.github.clientSecret,
    callbackURL: config.base + "/auth/github/callback"
}, function (accessToken, refreshToken, profile, done) {
    process.nextTick(function () {
        try {
            users.ensure(profile.id, defaults.user());
            users.set(profile.id, { ...profile, cachedAt: Date.now() }, "cache");
        } catch(e) {}
        return done(null, profile);
    });
}));
passport.serializeUser(function (user, done) { done(null, user); });
passport.deserializeUser(function (obj, done) { done(null, obj) });

const MemoryStore = require('connect-sqlite3')(session);
server.use(session({
    store: new MemoryStore({
        checkPeriod: 86400000
    }),
    secret: Buffer.from('PasteByZyrouge').toString("base64"),
    resave: false,
    saveUninitialized: false
}));
server.use(passport.initialize());
server.use(passport.session());
server.get("/login", (req, res) => (res.redirect("/auth/github")));
server.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/");
});
server.get("/auth/github", passport.authenticate("github"));
server.get("/auth/github/callback", passport.authenticate("github", { failureRedirect: "/login", }), (req, res) => {
    res.redirect(req.session.recentUrl || "/me");
});

// Save URL
server.use((req, res, next) => {
    req.session.recentUrl = req.url;
    next();
});

// Basic
server.get("/", (req, res) => {
    const pastes = bin.array().filter(paste => paste.visibility === "public") || [];
    res.render("index.ejs", { user: req.user || null, pastes: _.chunk(pastes, 3) });
});

server.get("/p/:code", (req, res) => res.redirect(`/paste/${req.params.code || ""}`));

// Paste - New
server.get("/pastes/new", (req, res) => {
    res.render("paste-new.ejs", {
        languages,
        visibility: defaults.visibility(),
        user: req.user
    });
});

server.post("/pastes/new", (req, res) => {
    if (!req.body) return res.render("error.ejs", { error: "No content was passed", user: req.user });
    if (!req.body.language) return res.render("error.ejs", { error: "No language was specified", user: req.user });
    if (!req.body.code) return res.render("error.ejs", { error: "No code was pasted", user: req.user });
    if (!req.body.visibility) return res.render("error.ejs", { error: "No visibility was specified", user: req.user });

    try {
        let pasteCode = randomCode(config.pasteCodeLen);
        if (!pasteCode) return res.render("error.ejs", { error: "Couldn\'t generate paste code", user: req.user });

        do {
            pasteCode = randomCode(config.pasteCodeLen);
        } while (bin.has(pasteCode));

        bin.set(pasteCode, {
            ...req.body,
            user: req.user ? req.user.id : null,
            id: pasteCode,
            createdAt: Date.now(),
            modifiedAt: null
        });

        if (req.user) users.push(req.user.id, { code: pasteCode, title: req.body.title || null, visibility: req.body.visibility }, "codes");

        res.redirect("/paste/" + pasteCode);
    } catch (e) {
        res.status(500).render("error.ejs", { error: "Something went wrong at our end", user: req.user });
        console.error(e);
    }
});

// Paste - Edit
server.get("/paste/:code/edit", ensureAuthenticated, (req, res) => {
    const paste = bin.get(req.params.code) || null;
    if (!paste) return res.render("error.ejs", { error: "Paste doesn\'t exist", user: req.user });
    if (!paste.user || !req.user || paste.user !== req.user.id) return res.render("error.ejs", { error: "Missing Permissions", user: req.user });
    const fullLang = languages.find(lng => lng.code === paste.language) || "Unknown";
    const data = {
        languages,
        visibility: defaults.visibility(),
        params: req.params,
        paste: { ...paste, fullLang },
        user: req.user,
        info: null
    }

    if (data.user) {
        const rawcached = users.get(paste.user) || null;
        data.info = rawcached && rawcached.cache ? rawcached.cache : null;
    }
    res.render("paste-edit.ejs", data);
});

server.post("/paste/:code/edit", (req, res) => {
    const paste = bin.get(req.params.code) || null;
    if (!paste) return res.render("error.ejs", { error: "Paste doesn\'t exist", user: req.user });
    if (!paste.user || !req.user || paste.user !== req.user.id) return res.render("error.ejs", { error: "Missing Permissions", user: req.user });

    if (!req.body) return res.render("error.ejs", { error: "No content was passed", user: req.user });
    if (!req.body.language) return res.render("error.ejs", { error: "No language was specified", user: req.user });
    if (!req.body.code) return res.render("error.ejs", { error: "No code was pasted", user: req.user });
    if (!req.body.visibility) return res.render("error.ejs", { error: "No visibility was specified", user: req.user });

    try {
        bin.set(req.params.code, {
            ...paste,
            ...req.body,
            modifiedAt: Date.now()
        });

        res.redirect("/paste/" + req.params.code);
    } catch (e) {
        res.status(500).render("error.ejs", { error: "Something went wrong at our end", user: req.user });
        console.error(e);
    }
});

// Paste - Delete
server.get("/paste/:code/delete", (req, res) => {
    const paste = bin.get(req.params.code) || null;
    if (!paste) return res.render("error.ejs", { error: "Paste doesn\'t exist", user: req.user });
    if (!paste.user || !req.user || paste.user !== req.user.id) return res.render("error.ejs", { error: "Missing Permissions", user: req.user });

    try {
        bin.delete(req.params.code);

        const user = users.get(req.user.id);
        user.codes = user.codes.filter(codes => codes.code !== req.params.code);
        users.set(req.user.id, user);

        res.redirect("/me/");
    } catch (e) {
        res.status(500).render("error.ejs", { error: "Something went wrong at our end", user: req.user });
        console.error(e);
    }
});

// Paste - View
server.get("/paste/:code", (req, res) => {
    const paste = bin.get(req.params.code) || null;
    if (!paste) return res.render("error.ejs", { error: "Paste doesn\'t exist", user: req.user });
    if (paste.visibility && paste.visibility === "private" && (!req.user || paste.user !== req.user.id)) return res.render("error.ejs", { error: "Missing Permissions", user: req.user });

    const fullLang = languages.find(lng => lng.code === paste.language) || "Unknown";
    const data = {
        languages,
        params: req.params,
        paste: { ...paste, fullLang },
        user: req.user,
        info: null
    }
    if (data.user) {
        const rawcached = users.get(paste.user) || null;
        data.info = rawcached && rawcached.cache ? rawcached.cache : null;
    }
    res.render("paste-view.ejs", data);
});

// Profile
server.get("/me", ensureAuthenticated, (req, res) => {
    const info = users.get(req.user.id) || defaults.user();
    res.render("me.ejs", { user: req.user, info, codes: _.chunk(info.codes, 3) });
});

server.listen(config.port, () => {
    bin.fetchEverything();
    logger.info(`Environment: ${_.capitalize(process.env.NODE_ENV || "unknown")}`);
    logger.info(`Listening on PORT ${config.port}`);
});

function randomCode(length) {
    const characters = [..."abcdefghijklmnopqrstuvwxyz", ..."1234567890"];
    let output = "";
    for (let i = 0; i < length; i++) {
        output += (Math.random() >= 0.5 ? characters.random() : characters.random().toUpperCase());
    }
    return output;
}

function ensureAuthenticated (req, res, next) {
    if (req.isAuthenticated()) return next();
    else return res.redirect('/login');
}

Array.prototype.random = function () {
    return this[Math.floor(Math.random() * this.length)];
}