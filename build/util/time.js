"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.secondsToHumanReadable = void 0;
const moment_1 = __importDefault(require("moment"));
require("moment-duration-format");
function secondsToHumanReadable(seconds) {
    return moment_1.default.duration(Number(seconds), 'seconds').format();
}
exports.secondsToHumanReadable = secondsToHumanReadable;
