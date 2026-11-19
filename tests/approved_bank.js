"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
module.exports = function approvedBank() {
 const read = n => JSON.parse(fs.readFileSync(path.join(__dirname,n),"utf8"));
 const bank = read("fixtures/scope-v69-approved.json"), edit = read("fixtures/v72-a003.json");
 const index = bank.questions.findIndex(q=>q.id===edit.id);
 assert.deepEqual(bank.questions[index],edit.before);
 bank.questions[index]=edit.after;
 return bank;
};
