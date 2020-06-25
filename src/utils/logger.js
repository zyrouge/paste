const { blueBright, redBright, yellowBright, greenBright, magentaBright, cyanBright, gray } = require("chalk");
const time = new Date().toLocaleTimeString(undefined, { hour12: false });
const maxLength = 8;

module.exports = {
    log: (msg) => (console.log(`${gray(time)} ${cyanBright(fillChar("LOG"))} ${msg}`)),
    success: (msg) => (console.log(`${gray(time)} ${greenBright(fillChar("SUCCESS"))} ${msg}`)),
    info: (msg) => (console.log(`${gray(time)} ${blueBright(fillChar("INFO"))} ${msg}`)),
    warn: (msg) => (console.log(`${gray(time)} ${yellowBright(fillChar("WARN"))} ${msg}`)),
    debug: (msg) => (process.argv && process.argv.includes("--debug") ? console.log(`${gray(time)} ${magentaBright(fillChar("DEBUG"))} ${msg}`) : false),
    error: (msg) => (console.log(`${gray(time)} ${redBright(fillChar("ERROR"))} ${msg}`))
}

function fillChar(word) {
    const remainingChar = maxLength - word.length;
    return (word + " ".repeat(remainingChar) + ">");
}