import { createRequire as __officeCreateRequire } from "node:module";
import { dirname as __officeDirname } from "node:path";
import { fileURLToPath as __officeFileURLToPath } from "node:url";
const require = __officeCreateRequire(import.meta.url);
const __filename = __officeFileURLToPath(import.meta.url);
const __dirname = __officeDirname(__filename);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js"(exports, module) {
    var constants = __require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module.exports = patch;
    function patch(fs) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs);
      }
      if (!fs.lutimes) {
        patchLutimes(fs);
      }
      fs.chown = chownFix(fs.chown);
      fs.fchown = chownFix(fs.fchown);
      fs.lchown = chownFix(fs.lchown);
      fs.chmod = chmodFix(fs.chmod);
      fs.fchmod = chmodFix(fs.fchmod);
      fs.lchmod = chmodFix(fs.lchmod);
      fs.chownSync = chownFixSync(fs.chownSync);
      fs.fchownSync = chownFixSync(fs.fchownSync);
      fs.lchownSync = chownFixSync(fs.lchownSync);
      fs.chmodSync = chmodFixSync(fs.chmodSync);
      fs.fchmodSync = chmodFixSync(fs.fchmodSync);
      fs.lchmodSync = chmodFixSync(fs.lchmodSync);
      fs.stat = statFix(fs.stat);
      fs.fstat = statFix(fs.fstat);
      fs.lstat = statFix(fs.lstat);
      fs.statSync = statFixSync(fs.statSync);
      fs.fstatSync = statFixSync(fs.fstatSync);
      fs.lstatSync = statFixSync(fs.lstatSync);
      if (fs.chmod && !fs.lchmod) {
        fs.lchmod = function(path, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs.lchmodSync = function() {
        };
      }
      if (fs.chown && !fs.lchown) {
        fs.lchown = function(path, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs.rename = typeof fs.rename !== "function" ? fs.rename : (function(fs$rename) {
          function rename2(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename2, fs$rename);
          return rename2;
        })(fs.rename);
      }
      fs.read = typeof fs.read !== "function" ? fs.read : (function(fs$read) {
        function read(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read);
        return read;
      })(fs.read);
      fs.readSync = typeof fs.readSync !== "function" ? fs.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs.readSync);
      function patchLchmod(fs2) {
        fs2.lchmod = function(path, mode, callback) {
          fs2.open(
            path,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs2.fchmod(fd, mode, function(err2) {
                fs2.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs2.lchmodSync = function(path, mode) {
          var fd = fs2.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs2.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs2.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs2.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs2) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs2.futimes) {
          fs2.lutimes = function(path, at, mt, cb) {
            fs2.open(path, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs2.futimes(fd, at, mt, function(er2) {
                fs2.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs2.lutimesSync = function(path, at, mt) {
            var fd = fs2.openSync(path, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs2.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs2.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs2.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs2.futimes) {
          fs2.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs2.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs, target, options, callback) : orig.call(fs, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs, target, options) : orig.call(fs, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js"(exports, module) {
    var Stream = __require("stream").Stream;
    module.exports = legacy;
    function legacy(fs) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path, options);
        Stream.call(this);
        var self = this;
        this.path = path;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path, options);
        Stream.call(this);
        this.path = path;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index = 0, length = keys.length; index < length; index++) {
          var key = keys[index];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js"(exports, module) {
    "use strict";
    module.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// ../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js"(exports, module) {
    var fs = __require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = __require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = /* @__PURE__ */ Symbol.for("graceful-fs.queue");
      previousSymbol = /* @__PURE__ */ Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context, queue2) {
      Object.defineProperty(context, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs, queue);
      fs.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs.close);
      fs.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs[gracefulQueue]);
          __require("assert").equal(fs[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs[gracefulQueue]);
    }
    module.exports = patch(clone(fs));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched) {
      module.exports = patch(fs);
      fs.__patched = true;
    }
    function patch(fs2) {
      polyfills(fs2);
      fs2.gracefulify = patch;
      fs2.createReadStream = createReadStream2;
      fs2.createWriteStream = createWriteStream;
      var fs$readFile = fs2.readFile;
      fs2.readFile = readFile4;
      function readFile4(path, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path, options, cb);
        function go$readFile(path2, options2, cb2, startTime) {
          return fs$readFile(path2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs2.writeFile;
      fs2.writeFile = writeFile2;
      function writeFile2(path, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path, data, options, cb);
        function go$writeFile(path2, data2, options2, cb2, startTime) {
          return fs$writeFile(path2, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs2.appendFile;
      if (fs$appendFile)
        fs2.appendFile = appendFile;
      function appendFile(path, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path, data, options, cb);
        function go$appendFile(path2, data2, options2, cb2, startTime) {
          return fs$appendFile(path2, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path2, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs2.copyFile;
      if (fs$copyFile)
        fs2.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs2.readdir;
      fs2.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path2, options2, cb2, startTime) {
          return fs$readdir(path2, fs$readdirCallback(
            path2,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path2, options2, cb2, startTime) {
          return fs$readdir(path2, options2, fs$readdirCallback(
            path2,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path, options, cb);
        function fs$readdirCallback(path2, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path2, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs2);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs2.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs2.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs2, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs2, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs2, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs2, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open2(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open2(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream2(path, options) {
        return new fs2.ReadStream(path, options);
      }
      function createWriteStream(path, options) {
        return new fs2.WriteStream(path, options);
      }
      var fs$open = fs2.open;
      fs2.open = open2;
      function open2(path, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path, flags, mode, cb);
        function go$open(path2, flags2, mode2, cb2, startTime) {
          return fs$open(path2, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path2, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs2;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs[gracefulQueue].length; ++i) {
        if (fs[gracefulQueue][i].length > 2) {
          fs[gracefulQueue][i][3] = now;
          fs[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs[gracefulQueue].length === 0)
        return;
      var elem = fs[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js"(exports, module) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(this._errors.length - 1, this._errors.length);
          this._timeouts = this._cachedTimeouts.slice(0);
          timeout = this._timeouts.shift();
        } else {
          return false;
        }
      }
      var self = this;
      var timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js"(exports) {
    var RetryOperation = require_retry_operation();
    exports.operation = function(options) {
      var timeouts = exports.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// ../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js
var require_retry2 = __commonJS({
  "../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// ../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js"(exports, module) {
    var process2 = global.process;
    var processOk = function(process3) {
      return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
    };
    if (!processOk(process2)) {
      module.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process2.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process2.__signal_exit_emitter__) {
        emitter = process2.__signal_exit_emitter__;
      } else {
        emitter = process2.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process2.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process2.emit = originalProcessEmit;
        process2.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process2.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process2.kill(process2.pid, sig);
          }
        };
      });
      module.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process2.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process2.emit = processEmit;
        process2.reallyExit = processReallyExit;
      };
      module.exports.load = load;
      originalProcessReallyExit = process2.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process2.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        originalProcessReallyExit.call(process2, process2.exitCode);
      };
      originalProcessEmit = process2.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process2.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process2.exitCode, null);
          emit("afterexit", process2.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
    "use strict";
    var cacheSymbol = /* @__PURE__ */ Symbol();
    function probe(file, fs, callback) {
      const cachedPrecision = fs[cacheSymbol];
      if (cachedPrecision) {
        return fs.stat(file, (err, stat2) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat2.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs.stat(file, (err2, stat2) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat2.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs, cacheSymbol, { value: precision });
          callback(null, stat2.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module.exports.probe = probe;
    module.exports.getMtime = getMtime;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
    "use strict";
    var path = __require("path");
    var fs = require_graceful_fs();
    var retry = require_retry2();
    var onExit = require_signal_exit();
    var mtimePrecision = require_mtime_precision();
    var locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath) {
        return callback(null, path.resolve(file));
      }
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      const lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err) {
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2) {
              options.fs.rmdir(lockfilePath, () => {
              });
              return callback(err2);
            }
            callback(null, mtime, mtimePrecision2);
          });
        }
        if (err.code !== "EEXIST") {
          return callback(err);
        }
        if (options.stale <= 0) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        options.fs.stat(lockfilePath, (err2, stat2) => {
          if (err2) {
            if (err2.code === "ENOENT") {
              return acquireLock(file, { ...options, stale: 0 }, callback);
            }
            return callback(err2);
          }
          if (!isLockStale(stat2, options)) {
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          }
          removeLock(file, options, (err3) => {
            if (err3) {
              return callback(err3);
            }
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat2, options) {
      return stat2.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT") {
          return callback(err);
        }
        callback();
      });
    }
    function updateLock(file, options) {
      const lock2 = locks[file];
      if (lock2.updateTimeout) {
        return;
      }
      lock2.updateDelay = lock2.updateDelay || options.update;
      lock2.updateTimeout = setTimeout(() => {
        lock2.updateTimeout = null;
        options.fs.stat(lock2.lockfilePath, (err, stat2) => {
          const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
          if (err) {
            if (err.code === "ENOENT" || isOverThreshold) {
              return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1e3;
            return updateLock(file, options);
          }
          const isMtimeOurs = lock2.mtime.getTime() === stat2.mtime.getTime();
          if (!isMtimeOurs) {
            return setLockAsCompromised(
              file,
              lock2,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          }
          const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
          options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
            const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
            if (lock2.released) {
              return;
            }
            if (err2) {
              if (err2.code === "ENOENT" || isOverThreshold2) {
                return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
              }
              lock2.updateDelay = 1e3;
              return updateLock(file, options);
            }
            lock2.mtime = mtime;
            lock2.lastUpdate = Date.now();
            lock2.updateDelay = null;
            updateLock(file, options);
          });
        });
      }, lock2.updateDelay);
      if (lock2.updateTimeout.unref) {
        lock2.updateTimeout.unref();
      }
    }
    function setLockAsCompromised(file, lock2, err) {
      lock2.released = true;
      if (lock2.updateTimeout) {
        clearTimeout(lock2.updateTimeout);
      }
      if (locks[file] === lock2) {
        delete locks[file];
      }
      lock2.options.onCompromised(err);
    }
    function lock(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: true,
        retries: 0,
        fs,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      };
      options.retries = options.retries || 0;
      options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
      options.stale = Math.max(options.stale || 0, 2e3);
      options.update = options.update == null ? options.stale / 2 : options.update || 0;
      options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2)) {
              return;
            }
            if (err2) {
              return callback(operation.mainError());
            }
            const lock2 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options);
            callback(null, (releasedCallback) => {
              if (lock2.released) {
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              }
              unlock(file2, { ...options, realpath: false }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs,
        realpath: true,
        ...options
      };
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const lock2 = locks[file2];
        if (!lock2) {
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        }
        lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
        lock2.released = true;
        delete locks[file2];
        removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: true,
        fs,
        ...options
      };
      options.stale = Math.max(options.stale || 0, 2e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        options.fs.stat(getLockFile(file2, options), (err2, stat2) => {
          if (err2) {
            return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
          }
          return callback(null, !isLockStale(stat2, options));
        });
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.check = check;
    module.exports.getLocks = getLocks;
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
    "use strict";
    var fs = require_graceful_fs();
    function createSyncFs(fs2) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs2 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs2[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// ../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js"(exports, module) {
    "use strict";
    var lockfile = require_lockfile();
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock(file, options) {
      const release = await toPromise(lockfile.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      const release = toSync(lockfile.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile.check)(file, toSyncOptions(options));
    }
    module.exports = lock;
    module.exports.lock = lock;
    module.exports.unlock = unlock;
    module.exports.lockSync = lockSync;
    module.exports.unlockSync = unlockSync;
    module.exports.check = check;
    module.exports.checkSync = checkSync;
  }
});

// src/extension.ts
import {
  CanvasError,
  createCanvas,
  joinSession
} from "@github/copilot-sdk/extension";
import { join as join7 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// ../shared/auth/auth-contract.ts
var OFFICE_SCOPE = "https://augloop.office.com/v2/.default";
var GRAPH_SCOPE = "https://graph.microsoft.com/.default";
var WAC_RESOURCE = "e03a13ee-9730-4cae-8525-47559c8cf18a";
var WAC_SCOPE = `${WAC_RESOURCE}/.default`;
var OFFICE_WAM_CLIENT_ID = "d3590ed6-52b3-4102-aeff-aad2292ab01c";
var MSAL_ORGANIZATIONS_AUTHORITY = "https://login.microsoftonline.com/organizations";
var AUTH_HELPER_TIMEOUT_MS = 5 * 60 * 1e3;
var GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var AuthError = class extends Error {
  code;
  resource;
  claims;
  constructor(code, message, resource, claims) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.resource = resource;
    this.claims = claims;
  }
};
function validateAccount(value) {
  if (!value || typeof value !== "object" || !("homeAccountId" in value) || typeof value.homeAccountId !== "string" || !value.homeAccountId || !("tenantId" in value) || typeof value.tenantId !== "string" || !GUID.test(value.tenantId) || !("username" in value) || typeof value.username !== "string") {
    throw new AuthError("account_mismatch", "The authentication provider returned no valid account identity.");
  }
  return { homeAccountId: value.homeAccountId, tenantId: value.tenantId, username: value.username };
}
function sameAccount(left, right) {
  return left.homeAccountId.toLowerCase() === right.homeAccountId.toLowerCase() && left.tenantId.toLowerCase() === right.tenantId.toLowerCase();
}
function normalizeAccountUsername(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new AuthError("invalid_request", "The account username must be a string.");
  const username = value.trim();
  if (!username || [...username].length > 320 || /[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(username)) {
    throw new AuthError("invalid_request", "Enter a valid work or school username of at most 320 characters.");
  }
  return username;
}
function mergeClaims(target, input, depth = 0) {
  if (depth > 32) throw new AuthError("invalid_claims", "Authentication claims are too deeply nested.");
  for (const [key, value] of Object.entries(input)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new AuthError("invalid_claims", "The authentication claims request is invalid.");
    }
    if (!(key in target) && value && typeof value === "object" && !Array.isArray(value)) {
      const nested = /* @__PURE__ */ Object.create(null);
      mergeClaims(nested, value, depth + 1);
      target[key] = nested;
    } else if (!(key in target)) target[key] = value;
    else if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
    else if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      mergeClaims(target[key], value, depth + 1);
    } else throw new AuthError("invalid_claims", "Conflicting authentication claims cannot be combined safely.");
  }
}
function normalizeClaims(input) {
  if (input === void 0 || input === null || input === "") return void 0;
  const claims = /* @__PURE__ */ Object.create(null);
  for (const item of Array.isArray(input) ? input : [input]) {
    let value = item;
    if (typeof item === "string") {
      if (item.length > 16384) throw new AuthError("invalid_claims", "Authentication claims exceed the allowed size.");
      try {
        value = JSON.parse(item);
      } catch {
        throw new AuthError("invalid_claims", "Authentication claims must be valid JSON.");
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AuthError("invalid_claims", "Authentication claims must be a JSON object.");
    }
    mergeClaims(claims, value);
  }
  const result = JSON.stringify(claims);
  if (result.length > 16384) throw new AuthError("invalid_claims", "Authentication claims exceed the allowed size.");
  return result === "{}" ? void 0 : result;
}
function authErrorBody(error) {
  return { error: error.message, code: error.code, ...error.resource ? { resource: error.resource } : {} };
}
function authHttpStatus(error) {
  if (error.code === "access_denied" || error.code === "account_mismatch") return 403;
  if (error.code === "auth_busy") return 409;
  if (error.code === "timeout") return 504;
  if (["invalid_request", "invalid_claims", "username_required"].includes(error.code)) return 400;
  return 401;
}

// ../shared/auth/auth-product.ts
var NATIVE_ARCHITECTURES = ["x64", "arm64"];
var SHARED_WXP_MACOS = {
  clientId: "8635a963-d212-4631-a476-150106739fb2",
  redirectUri: "msauth.com.msauth.unsignedapp://auth",
  architectures: NATIVE_ARCHITECTURES
};
var GENERIC_AUTH_PRODUCT = {
  name: "Office",
  workerPathEnvVar: "OFFICE_AUTH_WORKER_PATH",
  windowExecutable: "OfficeAuthWindow.exe",
  lockPrefix: "office",
  architectures: NATIVE_ARCHITECTURES,
  additionalScopes: []
};
var MACOS_PLATFORM = "darwin";
var WINDOWS_PLATFORM = "win32";
function resolveProductClientId(product, platform = process.platform) {
  return platform === MACOS_PLATFORM && product.macOS ? product.macOS.clientId : OFFICE_WAM_CLIENT_ID;
}
function resolveProductConnectScopes(product, platform = process.platform) {
  return platform === MACOS_PLATFORM && product.macOS ? [OFFICE_SCOPE] : [OFFICE_SCOPE, GRAPH_SCOPE];
}

// src/runtime/auth/auth-product.ts
var WORD_AUTH_PRODUCT = {
  name: "Word",
  workerPathEnvVar: "WORD_AUTH_WORKER_PATH",
  windowExecutable: "WordAuthWindow.exe",
  lockPrefix: "word",
  architectures: NATIVE_ARCHITECTURES,
  additionalScopes: [WAC_SCOPE],
  macOS: SHARED_WXP_MACOS
};

// ../shared/auth/account-auth.ts
import { access, mkdir as mkdir2, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";

// ../shared/runtime/process-lock.ts
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
async function coordinationPath(name) {
  if (process.platform === WINDOWS_PLATFORM) return `\\\\.\\pipe\\${name}`;
  if (process.platform !== MACOS_PLATFORM || !process.getuid) {
    throw new Error("Office runtime coordination requires Windows or macOS.");
  }
  const uid = process.getuid();
  const directory = join(tmpdir(), `office-copilot-${uid}`);
  await mkdir(directory, { recursive: true, mode: 448 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.uid !== uid || (metadata.mode & 63) !== 0) {
    throw new Error("Office runtime coordination requires a private, user-owned socket directory.");
  }
  const path = join(directory, createHash("sha256").update(name).digest("hex").slice(0, 24));
  if (Buffer.byteLength(path) > 103) throw new Error("The temporary directory path is too long for Office runtime coordination.");
  return path;
}
async function listenExclusive(name) {
  const path = await coordinationPath(name);
  const server = createServer((socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code === "EADDRINUSE") resolve(void 0);
      else reject(error);
    };
    server.once("error", onError);
    server.listen(path, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
function createDirectoryLock(directory, resource, {
  timeoutMs = 3e4,
  retryMs = 25,
  product = GENERIC_AUTH_PRODUCT
} = {}) {
  let name;
  const resolveName = () => name ??= (async () => {
    await mkdir(directory, { recursive: true, mode: 448 });
    const resolved = await realpath(directory);
    const canonical = process.platform === WINDOWS_PLATFORM ? resolved.toLowerCase() : resolved;
    const hash = createHash("sha256").update(`${canonical}\0${resource}`).digest("hex");
    return `${product.lockPrefix}-lock-${hash}`;
  })().catch((error) => {
    name = void 0;
    throw error;
  });
  async function tryAcquire() {
    const lockName = await resolveName();
    if (process.platform === MACOS_PLATFORM) {
      const { default: lockfile } = await Promise.resolve().then(() => __toESM(require_proper_lockfile(), 1));
      try {
        const release = await lockfile.lock(join(directory, `.${lockName}`), {
          realpath: false
        });
        return { release };
      } catch (error) {
        if (error?.code === "ELOCKED") return void 0;
        throw error;
      }
    }
    const server = await listenExclusive(lockName);
    return server ? { release: () => closeServer(server) } : void 0;
  }
  async function acquire() {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const held = await tryAcquire();
      if (held) return held;
      if (Date.now() >= deadline) {
        throw new Error(`${product.name} ${resource} is locked by another Copilot session. Try again shortly.`);
      }
      await sleep(retryMs);
    }
  }
  return {
    tryAcquire,
    async run(work) {
      const held = await acquire();
      try {
        return await work();
      } finally {
        await held.release();
      }
    }
  };
}

// ../shared/auth/account-auth.ts
var exists = (path) => access(path).then(() => true, () => false);
function createAccountAuth({
  provider,
  selectionPath,
  legacySelectionPath,
  now = Date.now,
  product = GENERIC_AUTH_PRODUCT,
  lock = createDirectoryLock(dirname(selectionPath), "account selection", { product })
}) {
  const importMarkerPath = join2(dirname(selectionPath), "legacy-import.json");
  let account;
  let changing = false;
  let generation = 0;
  let uses = 0;
  let coordination = {};
  const cache = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const challenges = /* @__PURE__ */ new Map();
  function tokenResult(result, expected) {
    const identity = validateAccount(result.account);
    if (expected && !sameAccount(expected, identity)) {
      throw new AuthError("account_mismatch", "Authentication returned a different account or tenant. No token was used.");
    }
    const expiresAt = Date.parse(result.expiresOn);
    if (typeof result.accessToken !== "string" || !result.accessToken || !Number.isFinite(expiresAt) || expiresAt <= now()) {
      throw new AuthError("authentication_failed", "The auth helper returned an expired or invalid token.");
    }
    return { identity, token: result.accessToken, expiresAt };
  }
  async function persist(identity) {
    await mkdir2(dirname(selectionPath), { recursive: true, mode: 448 });
    if (!identity) {
      await rm(selectionPath, { force: true });
      return;
    }
    const temporary = `${selectionPath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, account: identity }), { mode: 384 });
    await rename(temporary, selectionPath);
  }
  function status() {
    return {
      generation,
      state: changing ? "connecting" : !account ? "disconnected" : challenges.size ? "reauthentication_required" : "connected",
      ...account ? { account: { ...account } } : {},
      requiredResources: [...challenges.keys()]
    };
  }
  function clear() {
    generation++;
    cache.clear();
    pending.clear();
    challenges.clear();
  }
  async function readSelection() {
    let record2;
    try {
      record2 = JSON.parse(await readFile(selectionPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return void 0;
      throw new AuthError("authentication_failed", `${product.name} account state is unreadable. Repair or remove the account selection file.`);
    }
    if (record2?.version !== 1) throw new AuthError("authentication_failed", `Unsupported ${product.name} account state.`);
    return validateAccount(record2.account);
  }
  async function synchronize(mayAdopt = () => true) {
    const selected = await readSelection();
    const unchanged = selected && account ? sameAccount(selected, account) && selected.username === account.username : selected === account;
    if (unchanged || !mayAdopt()) return;
    clear();
    account = selected;
    coordination.onAccountChanged?.();
  }
  async function markLegacyImportSettled() {
    if (!legacySelectionPath) return;
    await mkdir2(dirname(importMarkerPath), { recursive: true, mode: 448 });
    await writeFile(importMarkerPath, JSON.stringify({ version: 1 }), { mode: 384 });
  }
  async function importLegacySelection() {
    if (!legacySelectionPath || await exists(importMarkerPath)) return;
    const held = await lock.tryAcquire();
    if (!held) return;
    try {
      if (await exists(importMarkerPath)) return;
      let legacy;
      try {
        const record2 = JSON.parse(await readFile(legacySelectionPath, "utf8"));
        if (record2?.version === 1) legacy = validateAccount(record2.account);
      } catch {
      }
      if (legacy && !await exists(selectionPath)) await persist(legacy);
      await markLegacyImportSettled();
    } finally {
      await held.release();
    }
  }
  async function interactive(work) {
    if (changing || pending.size) throw new AuthError("auth_busy", `Another ${product.name} authentication operation is active.`);
    changing = true;
    let held;
    try {
      held = await lock.tryAcquire();
      if (!held) {
        throw new AuthError("auth_busy", `Another Copilot session is changing the ${product.name} account. Try again after it finishes.`);
      }
      await markLegacyImportSettled();
      if (await coordination.busyElsewhere?.()) {
        throw new AuthError("auth_busy", `A ${product.name} operation is running in another Copilot session. Wait for it to finish before changing the account.`);
      }
      await synchronize();
      await work();
    } finally {
      changing = false;
      await held?.release();
    }
    return status();
  }
  return {
    async initialize() {
      await importLegacySelection();
      account = await readSelection();
    },
    async refresh() {
      const idle = () => !changing && uses === 0 && !coordination.locallyBusy?.();
      if (idle()) await synchronize(idle);
    },
    // Pins the current account for work outside the operation journal, such as
    // uploads, and blocks account changes here until released. With `publish`,
    // other sessions are also told, so they refuse to change the account meanwhile.
    async beginUse({ publish = true } = {}) {
      if (changing) throw new AuthError("auth_busy", `${product.name} account selection is changing.`);
      uses++;
      const pinned = generation;
      let releaseLease;
      try {
        if (publish) releaseLease = await coordination.registerUse?.();
      } catch (error) {
        uses--;
        throw error;
      }
      let released = false;
      return {
        generation: pinned,
        async release() {
          if (released) return;
          released = true;
          uses--;
          await releaseLease?.();
        }
      };
    },
    configureCoordination(options) {
      coordination = { ...coordination, ...options };
    },
    status,
    requireInteraction(scope, claims) {
      for (const key of cache.keys()) {
        if (key.startsWith(`${scope}\0`)) cache.delete(key);
      }
      challenges.set(scope, normalizeClaims(claims));
    },
    async connect({ switchAccount = false, tenantId, username } = {}, signal) {
      if (tenantId && !GUID.test(tenantId)) throw new AuthError("invalid_request", "Tenant ID must be a GUID.");
      username = normalizeAccountUsername(username);
      return interactive(async () => {
        let selected = switchAccount ? void 0 : account;
        if (selected && tenantId && selected.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
          throw new AuthError("account_mismatch", "Use Switch account to select a different tenant.");
        }
        if (selected?.username && username && selected.username.toLowerCase() !== username.toLowerCase()) {
          throw new AuthError("account_mismatch", "Use Switch account to select a different username.");
        }
        const tokens = /* @__PURE__ */ new Map();
        const resources = /* @__PURE__ */ new Set([
          ...resolveProductConnectScopes(product),
          ...!switchAccount ? challenges.keys() : []
        ]);
        for (const scope of resources) {
          const claims = !switchAccount ? challenges.get(scope) : void 0;
          const result = tokenResult(await provider({
            operation: "connect",
            scope,
            account: selected,
            tenantId,
            ...!selected?.username && username ? { username } : {},
            ...claims ? { claims } : {},
            forceRefresh: true,
            forceInteractive: !switchAccount && challenges.has(scope)
          }, signal), selected);
          if (tenantId && result.identity.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
            throw new AuthError("account_mismatch", "Sign-in returned a different tenant.");
          }
          selected = result.identity;
          tokens.set(scope, { token: result.token, expiresAt: result.expiresAt });
        }
        signal?.throwIfAborted();
        await persist(selected);
        clear();
        account = selected;
        for (const [scope, token] of tokens) cache.set(`${scope}\0`, token);
      });
    },
    async disconnect(signal) {
      return interactive(async () => {
        const previous = account;
        await persist();
        clear();
        account = void 0;
        await provider({ operation: "disconnect", scope: OFFICE_SCOPE, account: previous }, signal);
      });
    },
    async getToken(scope, options = {}) {
      if (changing) throw new AuthError("auth_busy", `${product.name} account selection is changing.`);
      if (!account) throw new AuthError("not_connected", `Connect your ${product.name} account before using Office operations.`, scope);
      if (options.generation !== void 0 && options.generation !== generation) {
        throw new AuthError("account_mismatch", `The ${product.name} account changed while this operation was running. No token for the new account was used.`, scope);
      }
      if (challenges.has(scope)) {
        throw new AuthError("interaction_required", `Reconnect your ${product.name} account to satisfy the sign-in or consent requirement.`, scope);
      }
      const claims = normalizeClaims(options.claims);
      const force = options.forceRefresh === true || claims !== void 0 || options.rejectedToken !== void 0;
      const key = `${scope}\0${claims ?? ""}`;
      const cached = cache.get(key);
      if (!force && !pending.has(scope) && cached && cached.expiresAt > now() + 5 * 60 * 1e3) return cached.token;
      const selected = account;
      const epoch = generation;
      let operation = pending.get(scope);
      if (!operation || force && (!operation.force || operation.claims !== claims || operation.rejectedToken !== options.rejectedToken)) {
        const acquire = async () => {
          try {
            const result = tokenResult(await provider({
              operation: "token",
              scope,
              account: selected,
              forceRefresh: force,
              ...claims ? { claims } : {}
            }), selected);
            if (generation !== epoch) throw new AuthError("account_mismatch", `The ${product.name} account changed during authentication.`);
            if (options.rejectedToken && result.token === options.rejectedToken) {
              throw new AuthError("interaction_required", `The Microsoft account provider returned the rejected cached token. Reconnect your ${product.name} account.`, scope, claims);
            }
            if (challenges.has(scope)) {
              throw new AuthError("interaction_required", `Reconnect your ${product.name} account before retrying this resource.`, scope);
            }
            if (pending.get(scope) === entry) {
              cache.set(key, { token: result.token, expiresAt: result.expiresAt });
              cache.set(`${scope}\0`, { token: result.token, expiresAt: result.expiresAt });
            }
            return result.token;
          } catch (error) {
            cache.delete(key);
            cache.delete(`${scope}\0`);
            if (error instanceof AuthError && ["interaction_required", "account_unavailable"].includes(error.code)) {
              challenges.set(scope, challenges.get(scope) ?? normalizeClaims(error.claims) ?? claims);
              throw new AuthError("interaction_required", `Reconnect your ${product.name} account to satisfy the sign-in or consent requirement.`, scope);
            }
            throw error;
          }
        };
        const promise = operation ? operation.promise.then(acquire, acquire) : acquire();
        const entry = { force, claims, rejectedToken: options.rejectedToken, promise: promise.finally(() => {
          if (pending.get(scope) === entry) pending.delete(scope);
        }) };
        operation = entry;
        pending.set(scope, entry);
      }
      return operation.promise;
    }
  };
}

// src/runtime/auth/account-auth.ts
function createAccountAuth2(options) {
  return createAccountAuth({ ...options, product: WORD_AUTH_PRODUCT });
}

// src/runtime/local-mcp-client.ts
import http from "node:http";
import { randomUUID as randomUUID2 } from "node:crypto";

// ../shared/runtime/local-http.ts
import { randomBytes, timingSafeEqual } from "node:crypto";
var LOCAL_CAPABILITY_HEADER = "x-wxp-local-capability";
function createLocalCapability() {
  return randomBytes(32).toString("base64url");
}
function hasLocalCapability(request, capability, header = LOCAL_CAPABILITY_HEADER) {
  const supplied = request.headers[header];
  if (!capability || typeof supplied !== "string") return false;
  const expected = Buffer.from(capability);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function assertLoopbackBind(host) {
  if (host !== "127.0.0.1") throw new TypeError("Local Office servers must bind to 127.0.0.1.");
}
function requireJsonRequest(request, response) {
  const mediaType = request.headers["content-type"];
  if (typeof mediaType === "string" && mediaType.split(";")[0].trim().toLowerCase() === "application/json") {
    return true;
  }
  denyLocalRequest(response, 415, "Content-Type must be application/json.");
  return false;
}
function isJsonRpcPayload(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every(isJsonRpcMessage);
  return isJsonRpcMessage(value);
}
function isJsonRpcMessage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value;
  if (message.jsonrpc !== "2.0") return false;
  if (message.id !== void 0 && message.id !== null && typeof message.id !== "string" && typeof message.id !== "number") return false;
  if (typeof message.method === "string") {
    return message.result === void 0 && message.error === void 0 && (message.params === void 0 || message.params !== null && typeof message.params === "object");
  }
  return message.method === void 0 && message.id !== void 0 && Object.hasOwn(message, "result") !== Object.hasOwn(message, "error");
}
function validateLoopbackRequestHeaders(headers, expectedOrigin) {
  const expected = new URL(expectedOrigin);
  if (typeof headers.host !== "string" || headers.host.toLowerCase() !== expected.host) {
    return { valid: false, statusCode: 421, message: "Unexpected loopback Host header." };
  }
  if (headers.origin !== void 0 && headers.origin !== expected.origin || headers["sec-fetch-site"] === "cross-site") {
    return { valid: false, statusCode: 403, message: "Cross-origin loopback requests are not allowed." };
  }
  return { valid: true, statusCode: 200, message: "" };
}
function localRequestUrl(request, response) {
  response.setHeader("cache-control", "no-store");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  const origin = `http://127.0.0.1:${request.socket.localPort}`;
  const hostHeaders = request.rawHeaders.filter((_, index) => index % 2 === 0).filter((name) => name.toLowerCase() === "host");
  if (hostHeaders.length !== 1) {
    denyLocalRequest(response, 421, "Unexpected loopback Host header.");
    return;
  }
  const validation = validateLoopbackRequestHeaders(request.headers, origin);
  if (!validation.valid) {
    denyLocalRequest(response, validation.statusCode, validation.message);
    return;
  }
  try {
    const url = new URL(request.url ?? "/", origin);
    if (url.origin !== origin || url.username || url.password) throw new TypeError();
    return url;
  } catch {
    denyLocalRequest(response, 400, "Invalid local request target.");
    return;
  }
}
function denyLocalRequest(response, status = 403, message = "Local capability required.") {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ error: message }));
}

// src/runtime/local-mcp-client.ts
var MCP_PROTOCOL_VERSION = "2025-11-25";
function parseRpcMessages(contentType, body) {
  const text = body.toString("utf8").trim();
  if (!text) {
    return [];
  }
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return text.split(/\r?\n\r?\n/).flatMap((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5).trim())));
}
function postRpc(url, message, timeoutMs, sessionId, clientToken) {
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new TypeError("Local Word MCP must use a 127.0.0.1 HTTP endpoint.");
  }
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(message));
    const request = http.request(url, {
      method: "POST",
      headers: {
        ...clientToken ? { [LOCAL_CAPABILITY_HEADER]: clientToken } : {},
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "content-length": String(body.length),
        ...sessionId ? { "mcp-session-id": sessionId } : {}
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.once("error", reject);
      response.once("end", () => {
        const responseBody = Buffer.concat(chunks);
        if (response.statusCode === void 0 || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(
            `Local Word MCP returned HTTP ${response.statusCode}: ` + responseBody.toString("utf8")
          ));
          return;
        }
        try {
          resolve({
            messages: parseRpcMessages(
              String(response.headers["content-type"] || ""),
              responseBody
            ),
            sessionId: Array.isArray(response.headers["mcp-session-id"]) ? response.headers["mcp-session-id"][0] : response.headers["mcp-session-id"]
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(
        `Local Word MCP timed out after ${timeoutMs} ms`
      ));
    });
    request.once("error", reject);
    request.end(body);
  });
}
function responseForId(messages, id) {
  const message = messages.find((candidate) => candidate?.id === id);
  if (!message) {
    throw new Error("Local Word MCP returned no response for the request.");
  }
  if (message.error) {
    throw new Error(
      typeof message.error.message === "string" ? message.error.message : JSON.stringify(message.error)
    );
  }
  return message.result;
}
async function callLocalMcpTool({
  origin,
  path,
  name,
  args,
  timeoutMs,
  requireSession = true,
  clientToken
}) {
  const url = new URL(path, origin);
  const initializeId = `initialize-${randomUUID2()}`;
  const initialized = await postRpc(url, {
    jsonrpc: "2.0",
    id: initializeId,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "word-agent-extension",
        version: "1.0.0"
      }
    }
  }, timeoutMs, void 0, clientToken);
  responseForId(initialized.messages, initializeId);
  if (requireSession && !initialized.sessionId) {
    throw new Error("Local Word MCP did not establish a session.");
  }
  await postRpc(url, {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }, timeoutMs, initialized.sessionId, clientToken);
  const callId = `call-${randomUUID2()}`;
  const called = await postRpc(url, {
    jsonrpc: "2.0",
    id: callId,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  }, timeoutMs, initialized.sessionId, clientToken);
  return responseForId(called.messages, callId);
}

// ../shared/auth/native-auth.ts
import { spawn } from "node:child_process";
import { win32 } from "node:path";
function resolveAuthWorkerLaunch({
  workerPath,
  execPath = process.execPath,
  argv = process.argv,
  env = process.env,
  parentPid = process.pid,
  product = GENERIC_AUTH_PRODUCT
}) {
  const workerEnv = {
    ...env,
    [product.workerPathEnvVar]: workerPath
  };
  if (/^node(?:\.exe)?$/i.test(win32.basename(execPath))) {
    return { command: execPath, args: [workerPath], env: workerEnv };
  }
  const bootstrap = argv.find((argument) => win32.basename(argument).toLowerCase() === "extension_bootstrap.mjs");
  if (bootstrap) {
    return {
      command: execPath,
      args: [bootstrap],
      env: {
        ...workerEnv,
        COPILOT_EXTENSION_PARENT_PID: String(parentPid),
        EXTENSION_PATH: workerPath
      }
    };
  }
  throw new AuthError(
    "broker_unavailable",
    `The Copilot extension runtime cannot launch the ${product.name} authentication worker.`
  );
}
function createNativeAuthProvider({
  workerPath,
  product = GENERIC_AUTH_PRODUCT,
  clientId = resolveProductClientId(product),
  authority = MSAL_ORGANIZATIONS_AUTHORITY,
  timeoutMs = AUTH_HELPER_TIMEOUT_MS,
  resolveLaunch = resolveAuthWorkerLaunch
}) {
  return (request, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AuthError("cancelled", `${product.name} sign-in was cancelled.`));
      return;
    }
    let launch;
    try {
      launch = resolveLaunch({ workerPath, product });
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn(launch.command, launch.args, {
      env: launch.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    let failure;
    const stop = (error) => {
      failure ??= error;
      child.kill();
    };
    const abort = () => stop(new AuthError("cancelled", `${product.name} sign-in was cancelled.`));
    const timer = setTimeout(
      () => stop(new AuthError("timeout", `${product.name} authentication timed out.`)),
      request.operation === "token" ? Math.min(timeoutMs, 6e4) : timeoutMs
    );
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 1024 * 1024) stop(new AuthError("authentication_failed", "The auth helper returned an oversized response."));
    });
    child.stderr.resume();
    child.stdin.on("error", () => {
      stop(new AuthError("broker_unavailable", `The packaged ${product.name} auth helper could not receive its request.`));
    });
    child.once("error", () => {
      failure = new AuthError("broker_unavailable", `The packaged ${product.name} auth helper could not start. Reinstall a package for this platform.`);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0 && !output.trim()) {
        reject(new AuthError(
          "broker_unavailable",
          `The authentication worker exited (${code === null ? "terminated" : "0x" + (code >>> 0).toString(16)}) before returning a result. Reconnect or reinstall the plugin.`
        ));
        return;
      }
      let result;
      try {
        result = JSON.parse(output);
      } catch {
        reject(new AuthError("authentication_failed", "The auth helper returned an invalid response."));
        return;
      }
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        reject(new AuthError("authentication_failed", "The auth helper returned an invalid response."));
        return;
      }
      if (code !== 0 || result.ok !== true) {
        reject(new AuthError(
          typeof result.error?.code === "string" ? result.error.code : "authentication_failed",
          typeof result.error?.message === "string" ? result.error.message : `${product.name} authentication failed.`,
          request.scope,
          result.error?.claims
        ));
        return;
      }
      resolve(result);
    });
    const input = JSON.stringify({ ...request, clientId, authority });
    if (Buffer.byteLength(input) > 64 * 1024) {
      stop(new AuthError("invalid_request", `${product.name} authentication input is too large.`));
    } else child.stdin.end(input);
  });
}

// src/runtime/auth/native-auth.ts
function createNativeAuthProvider2(options) {
  return createNativeAuthProvider({ ...options, product: WORD_AUTH_PRODUCT });
}

// src/runtime/office-task-proxy.ts
import http2 from "node:http";
import https from "node:https";
import { randomUUID as randomUUID4 } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile3 } from "node:fs/promises";
import { dirname as dirname3, join as join5 } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/runtime/word-viewer.ts
import { existsSync } from "node:fs";
import { dirname as dirname2, join as join4 } from "node:path";
import { fileURLToPath } from "node:url";

// src/runtime/word-url.ts
var trustedHostPatterns = [
  /\.sharepoint\.com$/i,
  /\.sharepoint-df\.com$/i,
  /\.sharepoint\.us$/i,
  /\.sharepoint\.de$/i,
  /\.sharepoint\.cn$/i
];
var trustedExactHosts = /* @__PURE__ */ new Set([
  "onedrive.cloud.microsoft",
  "onedrive.live.com"
]);
function isTrustedWordHost(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return trustedExactHosts.has(normalized) || trustedHostPatterns.some((pattern) => pattern.test(normalized));
}

// ../shared/viewer/viewer-host.ts
import { readFile as readFile2 } from "node:fs/promises";
import { join as join3 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// ../shared/auth/http-auth.ts
function decodeAuthenticationClaims(encoded) {
  if (encoded.length > 24e3 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) {
    throw new AuthError("invalid_claims", "The service returned an invalid authentication challenge.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64url") !== encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")) {
    throw new AuthError("invalid_claims", "The service returned an invalid authentication challenge.");
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AuthError("invalid_claims", "Authentication claims must contain valid UTF-8.");
  }
  const claims = normalizeClaims(decoded);
  if (!claims) throw new AuthError("invalid_claims", "The service returned an empty authentication challenge.");
  return claims;
}
function normalizeViewerClaims(input) {
  if (input === void 0 || input === null || input === "") return void 0;
  const values = (Array.isArray(input) ? input : [input]).map((value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    return text.startsWith("{") ? text : decodeAuthenticationClaims(text);
  });
  return normalizeClaims(values);
}
function claimsFromResponse(response) {
  const header = response.headers.get("www-authenticate");
  if (!header || response.status !== 401) return void 0;
  const match = /(?:^|[,\s])claims\s*=\s*"([^"]+)"/i.exec(header);
  if (!match) {
    if (/insufficient_claims/i.test(header)) throw new AuthError("invalid_claims", "The service omitted its required authentication claims.");
    return void 0;
  }
  return decodeAuthenticationClaims(match[1]);
}

// ../shared/auth/renewable-office-fetch.ts
function createRenewableOfficeFetch(fetchImpl, officeTokenProvider2, onUnauthorized, product = GENERIC_AUTH_PRODUCT) {
  if (!officeTokenProvider2) {
    return fetchImpl;
  }
  return async (input, init = {}) => {
    let lastToken;
    const send = async (forceRefresh, claims2, rejectedToken) => {
      const token = await officeTokenProvider2({ forceRefresh, ...claims2 ? { claims: claims2 } : {}, ...rejectedToken ? { rejectedToken } : {} });
      lastToken = token;
      const headers = new Headers(init.headers);
      headers.set("authorization", ["Bearer", token].join(" "));
      return fetchImpl(input, {
        ...init,
        headers
      });
    };
    const response = await send(false);
    if (response.status !== 401) {
      return response;
    }
    let claims;
    try {
      claims = claimsFromResponse(response);
    } finally {
      await response.body?.cancel();
    }
    const refreshed = await send(true, claims, lastToken);
    if (refreshed.status === 401 && onUnauthorized) {
      try {
        onUnauthorized(claimsFromResponse(refreshed) ?? claims);
      } finally {
        await refreshed.body?.cancel();
      }
      throw new AuthError("interaction_required", `Reconnect your ${product.name} account before retrying this resource.`);
    }
    return refreshed;
  };
}

// ../shared/runtime/viewer-sessions.ts
function viewerSessionLifecycle(sessions, authStatus2) {
  const accountBinding = () => {
    const status = authStatus2?.();
    return JSON.stringify([status?.generation, status?.account]);
  };
  const revokeInstance = (instanceId) => {
    if (typeof instanceId !== "string" || !instanceId) return;
    for (const [key, session2] of sessions) {
      if (session2.instanceId === instanceId) sessions.delete(key);
    }
  };
  const isActive = (session2) => {
    if (!session2.key) return true;
    if (sessions.get(session2.key) !== session2 || session2.expiresAt === void 0 || session2.expiresAt <= Date.now() || session2.accountBinding !== accountBinding()) {
      sessions.delete(session2.key);
      return false;
    }
    return true;
  };
  return {
    revokeInstance,
    isActive,
    bind(key, origin, instanceId) {
      revokeInstance(instanceId);
      return { key, origin, instanceId, accountBinding: accountBinding() };
    },
    assertActive(session2) {
      if (!isActive(session2)) {
        throw new Error("Viewer session expired or revoked.");
      }
    }
  };
}

// ../shared/viewer/viewer-host.ts
var GRAPH_SCOPE2 = "https://graph.microsoft.com/.default";
var GRAPH_HOSTS = /* @__PURE__ */ new Set([
  "graph.microsoft.com",
  "graph.microsoft.us",
  "dod-graph.microsoft.us",
  "graph.microsoft.de",
  "microsoftgraph.chinacloudapi.cn"
]);
var VIEWER_SESSION_TTL_MS = 60 * 60 * 1e3;
var MAX_VIEWER_SESSION_REQUEST_BYTES = 64 * 1024;
var MAX_VIEWER_SESSIONS = 16;
var VIEWER_ASSETS = ["/viewer/viewer.bundle.js", "/viewer/viewer.bundle.css"];
function writeJson(response, statusCode, value) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}
async function readBoundedJsonRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_VIEWER_SESSION_REQUEST_BYTES) {
      throw new RangeError("Viewer request is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function fetchGraphJson(fetchImpl, path, name, noun) {
  const response = await fetchImpl(`https://graph.microsoft.com/v1.0${path}`, {
    headers: new Headers({ accept: "application/json" }),
    redirect: "manual"
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) {
      throw new AuthError("interaction_required", `Reconnect your ${name} account to access Microsoft Graph.`, GRAPH_SCOPE2);
    }
    if (response.status === 403) {
      throw new AuthError("access_denied", `The selected account cannot access this ${noun} in Microsoft Graph.`, GRAPH_SCOPE2);
    }
    throw new Error(`Microsoft Graph returned HTTP ${response.status}.`);
  }
  return response.json();
}
function createViewerHost(config) {
  const { product, viewerDirectory: viewerDirectory2, getToken, authStatus: authStatus2, onUnauthorized } = config;
  const name = product.authProduct.name;
  const noun = product.noun;
  const capabilities = config.capabilities ?? {};
  const fetchImpl = config.fetchImpl ?? fetch;
  const sessions = /* @__PURE__ */ new Map();
  const lifecycle = viewerSessionLifecycle(sessions, authStatus2);
  const graphFetch = createRenewableOfficeFetch(
    fetchImpl,
    (options) => getToken(GRAPH_SCOPE2, options),
    onUnauthorized ? (claims) => onUnauthorized(GRAPH_SCOPE2, claims) : void 0,
    product.authProduct
  );
  function parseArtifactUrl(value) {
    const artifact = product.parseArtifactUrl ? product.parseArtifactUrl(value) : new URL(value);
    if (artifact.protocol !== "https:" || !product.isTrustedHost(artifact.hostname)) {
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host.");
    }
    if (artifact.username || artifact.password) {
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host and must not include embedded credentials.");
    }
    if (artifact.port) {
      throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host and must not include an explicit port.");
    }
    return artifact;
  }
  function unsupportedAudience(detail = "") {
    return new TypeError(`${name} requested an unsupported token audience${detail}.`);
  }
  function scopeForResource(resourceUrl, documentOrigin) {
    if (product.supportsWac && resourceUrl === WAC_RESOURCE) {
      return WAC_SCOPE;
    }
    const url = new URL(resourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) {
      throw unsupportedAudience();
    }
    const host2 = url.hostname.toLowerCase();
    if (GRAPH_HOSTS.has(host2)) {
      return GRAPH_SCOPE2;
    }
    if (product.isTrustedHost(host2)) {
      if (url.origin !== documentOrigin) {
        throw unsupportedAudience(": it must match the current viewer session document origin");
      }
      return `${url.origin}/.default`;
    }
    if (product.officeHostSuffixes.some((suffix) => host2.endsWith(suffix))) {
      return `${url.origin}/.default`;
    }
    throw unsupportedAudience();
  }
  function pruneExpiredSessions() {
    const now = Date.now();
    for (const [key, session2] of sessions) {
      if (session2.expiresAt <= now) {
        sessions.delete(key);
      }
    }
  }
  function getSession(key) {
    pruneExpiredSessions();
    const session2 = sessions.get(key);
    return session2 && lifecycle.isActive(session2) ? session2 : null;
  }
  async function resolveSession(session2) {
    lifecycle.assertActive(session2);
    if (session2.resolved) {
      return session2.resolved;
    }
    const shareId = `u!${Buffer.from(session2.artifactUrl, "utf8").toString("base64url")}`;
    const driveItem = await fetchGraphJson(
      graphFetch,
      `/shares/${shareId}/driveItem?$select=id,name,parentReference`,
      name,
      noun
    );
    lifecycle.assertActive(session2);
    const driveId = driveItem?.parentReference?.driveId;
    const itemId = driveItem?.id;
    if (typeof driveId !== "string" || typeof itemId !== "string") {
      throw new Error("Microsoft Graph did not return a drive and item identity.");
    }
    const identity = await fetchGraphJson(
      graphFetch,
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=sharepointIds`,
      name,
      noun
    );
    lifecycle.assertActive(session2);
    const baseUrl = identity?.sharepointIds?.siteUrl;
    const fileId = identity?.sharepointIds?.listItemUniqueId;
    if (typeof baseUrl !== "string" || typeof fileId !== "string" || !product.isTrustedHost(new URL(baseUrl).hostname)) {
      throw new Error("Microsoft Graph did not return a trusted SharePoint identity.");
    }
    const tenantId = authStatus2?.()?.account?.tenantId;
    session2.resolved = {
      baseUrl,
      driveId,
      fileId,
      fileName: typeof driveItem.name === "string" ? driveItem.name : session2.title,
      itemId,
      wiseEnvironment: new URL(baseUrl).hostname.includes("sharepoint-df") ? "MSIT" : "PRODUCTION",
      ...tenantId ? { tenantId } : {}
    };
    return session2.resolved;
  }
  async function getCardData(artifactUrl, title) {
    const artifact = parseArtifactUrl(artifactUrl);
    const resolved = await resolveSession({
      artifactUrl: artifact.toString(),
      title: title || name
    });
    let thumbnailDataUri;
    const thumbnailResponse = await graphFetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(resolved.driveId)}/items/${encodeURIComponent(resolved.itemId)}/thumbnails/0/large/content`,
      { redirect: "follow" }
    );
    if (thumbnailResponse.status === 401 || thumbnailResponse.status === 403) {
      await thumbnailResponse.body?.cancel();
      throw new AuthError(
        thumbnailResponse.status === 401 ? "interaction_required" : "access_denied",
        `The selected account cannot load the ${noun} preview.`,
        GRAPH_SCOPE2
      );
    }
    if (!thumbnailResponse.ok && thumbnailResponse.status !== 404) {
      await thumbnailResponse.body?.cancel();
      throw new Error(`Microsoft Graph thumbnail returned HTTP ${thumbnailResponse.status}.`);
    }
    if (thumbnailResponse.ok) {
      const contentType = thumbnailResponse.headers.get("content-type");
      if (contentType?.startsWith("image/")) {
        const bytes = Buffer.from(await thumbnailResponse.arrayBuffer());
        if (bytes.length <= 2 * 1024 * 1024) {
          thumbnailDataUri = `data:${contentType};base64,${bytes.toString("base64")}`;
        }
      }
    }
    return {
      artifactUrl: artifact.toString(),
      fileName: resolved.fileName,
      ...thumbnailDataUri ? { thumbnailDataUri } : {}
    };
  }
  async function handleSelection(request, response, requestUrl, session2) {
    if (!requireJsonRequest(request, response)) return;
    try {
      if (requestUrl.hostname !== "127.0.0.1" || request.headers.origin !== requestUrl.origin) {
        writeJson(response, 403, { error: "Selection updates must come from the viewer page." });
        return;
      }
      if (!session2.instanceId || !config.onSelection) {
        writeJson(response, 409, { error: "This viewer has no chat canvas binding." });
        return;
      }
      const input = await readBoundedJsonRequest(request);
      if (!Array.isArray(input?.sheets) || !input.sheets.length || input.sheets.length > 8 || input.sheets.some((sheet) => typeof sheet.name !== "string" || !sheet.name.length || sheet.name.length > 128 || !Array.isArray(sheet.ranges) || !sheet.ranges.length || sheet.ranges.length > 32 || sheet.ranges.some((range) => typeof range !== "string" || !range.length || range.length > 128))) {
        throw new TypeError(`Invalid ${name} selection.`);
      }
      lifecycle.assertActive(session2);
      await config.onSelection({
        instanceId: session2.instanceId,
        workbookUrl: session2.artifactUrl,
        sheets: input.sheets.map(({ name: sheetName, ranges }) => ({ name: sheetName, ranges }))
      });
      writeJson(response, 200, { ok: true });
    } catch (error) {
      writeJson(
        response,
        error instanceof RangeError ? 413 : error instanceof SyntaxError || error instanceof TypeError ? 400 : 502,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  async function handleClose(request, response, requestUrl, session2, key) {
    if (requestUrl.hostname !== "127.0.0.1" || request.headers.origin !== requestUrl.origin) {
      writeJson(response, 403, { error: "Close requests must come from the viewer page." });
    } else if (!session2.instanceId || !config.onClose) {
      writeJson(response, 409, { error: "This viewer has no chat canvas binding." });
    } else {
      try {
        await config.onClose(session2.instanceId);
        sessions.delete(key);
        writeJson(response, 200, { ok: true });
      } catch (error) {
        writeJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  async function handleToken(request, response, session2) {
    if (!requireJsonRequest(request, response)) return;
    try {
      const body = await readBoundedJsonRequest(request);
      lifecycle.assertActive(session2);
      const isWac = product.supportsWac && body.resourceUrl === WAC_RESOURCE;
      const resource = isWac ? void 0 : new URL(body.resourceUrl);
      scopeForResource(body.resourceUrl, resource?.origin);
      const documentOrigin = resource && product.isTrustedHost(resource.hostname) ? new URL((await resolveSession(session2)).baseUrl).origin : void 0;
      const scope = scopeForResource(body.resourceUrl, documentOrigin);
      lifecycle.assertActive(session2);
      const tenantId = authStatus2?.()?.account?.tenantId;
      if (body.tenantId && tenantId && String(body.tenantId).toLowerCase() !== tenantId.toLowerCase()) {
        throw new AuthError("account_mismatch", `The ${noun} requested a different tenant. Switch accounts explicitly.`);
      }
      const claims = normalizeViewerClaims(body.claims);
      const token = await getToken(scope, {
        forceRefresh: body.forceRefresh === true || claims !== void 0,
        claims
      });
      lifecycle.assertActive(session2);
      writeJson(response, 200, { token });
    } catch (error) {
      if (error instanceof AuthError) {
        if (["interaction_required", "account_unavailable"].includes(error.code)) {
          onUnauthorized?.(error.resource ?? GRAPH_SCOPE2, error.claims);
        }
        writeJson(response, authHttpStatus(error), authErrorBody(error));
      } else {
        writeJson(response, error instanceof RangeError ? 413 : 400, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  const sessionRoutes = [
    "config",
    "token",
    ...capabilities.artifactRoute ? ["artifact"] : [],
    ...capabilities.statusRoute ? ["status"] : [],
    ...capabilities.selection ? ["selection", "close"] : []
  ];
  const sessionRoutePattern = new RegExp(
    `^/viewer/session/([a-f0-9]{32})(?:/(${sessionRoutes.join("|")}))?$`
  );
  const host = {
    revokeInstance: lifecycle.revokeInstance,
    resetAuthSessions() {
      sessions.clear();
      config.onReset?.();
    },
    hasActiveSessions() {
      pruneExpiredSessions();
      return sessions.size > 0;
    },
    createViewerUrl(origin, artifactUrl, title, mode = "view", instanceId = void 0) {
      pruneExpiredSessions();
      const artifact = parseArtifactUrl(artifactUrl);
      if (!["view", "edit"].includes(mode)) {
        throw new TypeError(`${name} canvas mode must be 'view' or 'edit'.`);
      }
      const key = randomUUID3().replaceAll("-", "");
      const binding = lifecycle.bind(key, origin, instanceId);
      if (sessions.size >= MAX_VIEWER_SESSIONS) {
        throw new Error(
          `The ${name} runtime already has ${MAX_VIEWER_SESSIONS} active viewer sessions.`
        );
      }
      sessions.set(key, {
        ...binding,
        artifactUrl: artifact.toString(),
        expiresAt: Date.now() + VIEWER_SESSION_TTL_MS,
        mode,
        title: title || name,
        instanceId
      });
      return `${origin}/viewer/session/${key}`;
    },
    ...capabilities.cardData ? { getCardData } : {},
    async handleRequest(request, response, requestUrl) {
      const validatedUrl = localRequestUrl(request, response);
      if (!validatedUrl) return true;
      requestUrl = validatedUrl;
      if (await config.preHandler?.(request, response, requestUrl)) {
        return true;
      }
      if (request.method === "GET" && VIEWER_ASSETS.includes(requestUrl.pathname)) {
        const isCss = requestUrl.pathname.endsWith(".css");
        response.setHeader("cache-control", "no-store");
        try {
          const asset = await readFile2(join3(
            viewerDirectory2,
            isCss ? "viewer.bundle.css" : "viewer.bundle.js"
          ));
          response.statusCode = 200;
          response.setHeader(
            "content-type",
            isCss ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8"
          );
          response.end(asset);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
          writeJson(response, 404, { error: `${name} viewer asset not found.` });
        }
        return true;
      }
      const match = sessionRoutePattern.exec(requestUrl.pathname);
      if (!match) {
        return false;
      }
      const session2 = getSession(match[1]);
      if (!session2 || session2.origin !== requestUrl.origin) {
        writeJson(response, 404, { error: `${name} viewer session expired.` });
        return true;
      }
      const route = match[2];
      if (request.method === "GET" && !route) {
        response.statusCode = 200;
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader(
          "content-security-policy",
          "default-src 'self' https: data: blob:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; frame-src https:; connect-src 'self' https:;"
        );
        response.end(await readFile2(join3(viewerDirectory2, "index.html")));
        return true;
      }
      if (request.method === "GET" && route === "artifact") {
        writeJson(response, 200, { artifactUrl: session2.artifactUrl });
        return true;
      }
      if (request.method === "GET" && route === "status") {
        writeJson(response, 200, { active: true });
        return true;
      }
      if (request.method === "GET" && route === "config") {
        try {
          const { itemId: _itemId, ...resolvedConfig } = await resolveSession(session2);
          lifecycle.assertActive(session2);
          writeJson(response, 200, { ...resolvedConfig, mode: session2.mode });
        } catch (error) {
          writeJson(
            response,
            error instanceof AuthError ? authHttpStatus(error) : 502,
            error instanceof AuthError ? authErrorBody(error) : {
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }
        return true;
      }
      if (request.method === "POST" && route === "selection") {
        await handleSelection(request, response, requestUrl, session2);
        return true;
      }
      if (request.method === "POST" && route === "close") {
        await handleClose(request, response, requestUrl, session2, match[1]);
        return true;
      }
      if (request.method === "POST" && route === "token") {
        await handleToken(request, response, session2);
        return true;
      }
      writeJson(response, 405, { error: "Method not allowed." });
      return true;
    }
  };
  return host;
}

// src/runtime/word-viewer.ts
var currentDirectory = dirname2(fileURLToPath(import.meta.url));
var adjacentViewerDirectory = join4(currentDirectory, "viewer");
var viewerDirectory = existsSync(adjacentViewerDirectory) ? adjacentViewerDirectory : join4(currentDirectory, "..", "viewer");
function createWordViewerHost({
  fetchImpl = fetch,
  resourceTokenProvider = async (_scope, _options) => {
    throw new AuthError("not_connected", "Connect your Word account before accessing documents.");
  },
  authStatus: authStatus2 = void 0,
  onUnauthorized = void 0
} = {}) {
  return createViewerHost({
    product: {
      authProduct: WORD_AUTH_PRODUCT,
      noun: "document",
      isTrustedHost: isTrustedWordHost,
      // Word's embed only needs the WAC sentinel and document-origin tokens.
      officeHostSuffixes: [],
      supportsWac: true
    },
    viewerDirectory,
    capabilities: { cardData: true },
    fetchImpl,
    getToken: resourceTokenProvider,
    authStatus: authStatus2,
    onUnauthorized
  });
}

// src/runtime/office-task-proxy.ts
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 0;
var DEFAULT_UPSTREAM_URL = "https://dogfood.augloop.svc.cloud.microsoft/mcp/office-agent-mcp";
var OFFICE_CLIENT_METADATA = JSON.stringify({
  appName: "Testing",
  appPlatform: "Client"
});
var MCP_PROTOCOL_VERSION2 = "2025-11-25";
var MAX_REQUEST_BYTES = 1024 * 1024;
var OAUTH_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
var TASK_TTL_MS = 60 * 60 * 1e3;
var TASK_TIMEOUT_MS = 30 * 60 * 1e3;
var DEFAULT_TASK_POLL_MS = 5e3;
var MIN_TASK_POLL_MS = 2e3;
var MAX_TASK_POLL_MS = 15e3;
var DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1e3;
var WORD_MCP_SERVER_NAME = "word-agent-mcp";
var WORD_TASK_TOOLS = /* @__PURE__ */ new Set([
  "generate_artifact",
  "edit_artifact"
]);
var WORD_TASK_DESCRIPTION_OVERRIDES = /* @__PURE__ */ new Map([
  [
    "generate_artifact",
    "Detailed description of the Word document to create. State what the user asked for in their own terms, preserving every requested fact, source constraint, section, tone, formatting requirement, and later refinement. The Word capability owns document structure, prose, layout, and formatting. Add nothing the user did not request, do not invent content or sources, and do not include placeholder or TODO text."
  ],
  [
    "edit_artifact",
    "Detailed description of the edits to apply to the existing Word document. Do NOT restate unchanged document content. Name what must change and what must not change in the user's own terms, preserving requested text, source constraints, tone, and formatting. Add nothing the user did not request, do not invent content or sources, and do not include placeholder or TODO text."
  ]
]);
var WORD_CARD_URI = "ui://word/result-card";
var WORD_CARD_DATA_TOOL = "word_card_data";
var WORD_CARD_TOOL = "show_document_card";
var runtimeDirectory = dirname3(fileURLToPath2(import.meta.url));
var adjacentCardPath = join5(runtimeDirectory, "viewer", "result-card.html");
var WORD_CARD_PATH = existsSync2(adjacentCardPath) ? adjacentCardPath : join5(runtimeDirectory, "..", "viewer", "result-card.html");
var HOP_BY_HOP_HEADERS = /* @__PURE__ */ new Set([
  LOCAL_CAPABILITY_HEADER,
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
var DECODED_BODY_HEADERS = /* @__PURE__ */ new Set([
  "content-encoding",
  "content-length",
  "content-range"
]);
function augmentInitializeRequest(body) {
  try {
    const message = JSON.parse(body.toString("utf8"));
    if (message?.method !== "initialize" || typeof message.params !== "object" || message.params === null) {
      return body;
    }
    message.params.protocolVersion = MCP_PROTOCOL_VERSION2;
    message.params.capabilities = {
      ...message.params.capabilities,
      tasks: { list: {}, cancel: {} }
    };
    return Buffer.from(JSON.stringify(message));
  } catch {
    return body;
  }
}
function addConversationMetadata(message, metadata) {
  if (message?.method !== "tools/call" || !WORD_TASK_TOOLS.has(message.params?.name) || !metadata || !Array.isArray(metadata.conversation)) {
    return message;
  }
  message.params._meta = {
    ...message.params._meta,
    conversationId: metadata.conversationId,
    conversation: metadata.conversation,
    conversationSchemaVersion: "2"
  };
  const args = message.params.arguments;
  if (args && typeof args === "object" && !Array.isArray(args) && (typeof args.userRequest !== "string" || !args.userRequest.trim())) {
    const latestUserMessage = [...metadata.conversation].reverse().find(
      (candidate) => candidate?.author === "user" && typeof candidate.text === "string" && candidate.text.trim()
    );
    if (latestUserMessage) {
      args.userRequest = latestUserMessage.text;
    }
  }
  return message;
}
function removeUntrustedUserRequest(message) {
  const args = message?.params?.arguments;
  if (message?.method === "tools/call" && WORD_TASK_TOOLS.has(message.params?.name) && args && typeof args === "object" && !Array.isArray(args)) {
    delete args.userRequest;
  }
}
function overrideWordToolSchema(tool) {
  const taskDescription = WORD_TASK_DESCRIPTION_OVERRIDES.get(tool?.name);
  const inputSchema = tool?.inputSchema;
  if (!taskDescription || !inputSchema || typeof inputSchema !== "object" || Array.isArray(inputSchema)) {
    return tool;
  }
  const properties = inputSchema.properties;
  const nextProperties = properties && typeof properties === "object" && !Array.isArray(properties) ? { ...properties } : {};
  delete nextProperties.userRequest;
  nextProperties.taskDescription = {
    ...nextProperties.taskDescription && typeof nextProperties.taskDescription === "object" && !Array.isArray(nextProperties.taskDescription) ? nextProperties.taskDescription : { type: "string" },
    description: taskDescription
  };
  return {
    ...tool,
    inputSchema: {
      ...inputSchema,
      properties: nextProperties,
      ...Array.isArray(inputSchema.required) ? {
        required: inputSchema.required.filter(
          (property) => property !== "userRequest"
        )
      } : {}
    }
  };
}
function transformRpcResponseMessage(requestMessage, responseMessage) {
  if (!responseMessage?.result || responseMessage.id !== requestMessage.id) {
    return responseMessage;
  }
  if (requestMessage?.method === "initialize") {
    return {
      ...responseMessage,
      result: {
        ...responseMessage.result,
        serverInfo: {
          ...responseMessage.result.serverInfo,
          name: WORD_MCP_SERVER_NAME
        }
      }
    };
  }
  if (requestMessage?.method !== "tools/list" || !Array.isArray(responseMessage.result.tools)) {
    return responseMessage;
  }
  return {
    ...responseMessage,
    result: {
      ...responseMessage.result,
      tools: responseMessage.result.tools.map(overrideWordToolSchema)
    }
  };
}
function ensureSseEventTerminator(responseBody) {
  const text = responseBody.toString("utf8");
  if (!/(?:^|\r?\n)(?:event|data):/.test(text)) {
    return responseBody;
  }
  const normalized = text.replace(/\r\n/g, "\n");
  return normalized.endsWith("\n\n") ? Buffer.from(normalized) : Buffer.from(`${normalized.replace(/\n*$/, "")}

`);
}
function transformRpcResponseBody(requestBody, responseBody) {
  let requestMessage;
  try {
    requestMessage = JSON.parse(requestBody.toString("utf8"));
  } catch {
    return responseBody;
  }
  if (Array.isArray(requestMessage)) {
    return responseBody;
  }
  const text = responseBody.toString("utf8");
  try {
    const parsed = JSON.parse(text);
    return Buffer.from(JSON.stringify(
      transformRpcResponseMessage(requestMessage, parsed)
    ));
  } catch {
    let changed = false;
    const transformed = text.replace(
      /^data:\s*(\{.*\})\s*$/gm,
      (line, payload) => {
        try {
          const parsed = JSON.parse(payload);
          const next = transformRpcResponseMessage(requestMessage, parsed);
          changed ||= next !== parsed;
          return `data: ${JSON.stringify(next)}`;
        } catch {
          return line;
        }
      }
    );
    return ensureSseEventTerminator(
      changed ? Buffer.from(transformed) : responseBody
    );
  }
}
function documentTitleFromUrl(artifactUrl) {
  const url = new URL(artifactUrl);
  const queryFileName = url.searchParams.get("file");
  if (queryFileName?.trim()) {
    return queryFileName.trim();
  }
  const fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
  return fileName || "Word document";
}
function decorateWordResult(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const candidates = [];
  const responseText = [];
  const structured = result.structuredContent;
  if (structured && typeof structured === "object") {
    candidates.push(
      structured.artifactUrl,
      structured.url,
      ...Array.isArray(structured.artifactUrls) ? structured.artifactUrls : []
    );
  }
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (item?.type !== "text" || typeof item.text !== "string") {
      continue;
    }
    if (item.text.trim()) {
      responseText.push(item.text);
    }
    for (const match of item.text.matchAll(/https:\/\/[^\s"'<>]+/g)) {
      candidates.push(match[0].replace(/[),.;]+$/, ""));
    }
    try {
      const parsed = JSON.parse(item.text);
      candidates.push(
        parsed?.artifactUrl,
        parsed?.url,
        ...Array.isArray(parsed?.artifactUrls) ? parsed.artifactUrls : []
      );
    } catch {
    }
  }
  const artifactUrl = candidates.find((candidate) => {
    try {
      const url = new URL(candidate);
      return url.protocol === "https:" && isTrustedWordHost(url.hostname);
    } catch {
      return false;
    }
  });
  if (!artifactUrl) {
    return result;
  }
  return {
    ...result,
    structuredContent: {
      ...structured && typeof structured === "object" ? structured : {},
      wordDocument: {
        artifactUrl,
        title: documentTitleFromUrl(artifactUrl)
      },
      ...responseText.length > 0 ? { wordAgentResponse: responseText.join("\n\n") } : {}
    }
  };
}
function forwardedRequestHeaders(headers, bodyLength) {
  const forwarded = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === void 0 || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        forwarded.append(name, item);
      }
    } else {
      forwarded.set(name, value);
    }
  }
  forwarded.set("content-length", String(bodyLength));
  forwarded.set("mcp-protocol-version", MCP_PROTOCOL_VERSION2);
  return forwarded;
}
function rewriteOAuthChallenge(value, localOrigin) {
  return value.replace(
    /(resource_metadata\s*=\s*")[^"]*(")/i,
    `$1${localOrigin}${OAUTH_RESOURCE_METADATA_PATH}$2`
  );
}
function copyResponseHeaders(upstreamResponse, response, localOrigin) {
  for (const [name, value] of upstreamResponse.headers) {
    const lowerName = name.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerName) && !DECODED_BODY_HEADERS.has(lowerName)) {
      response.setHeader(
        name,
        lowerName === "www-authenticate" ? rewriteOAuthChallenge(value, localOrigin) : value
      );
    }
  }
}
async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new RangeError("MCP request body is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function writeJsonError(response, statusCode, message) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ error: message }));
}
function writeRpcError(response, requestId, message) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    error: { code: -32e3, message }
  }));
}
function writeRpcResult(response, requestId, result) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    result
  }));
}
function validateCardDocument(artifactUrl, title) {
  const artifact = new URL(artifactUrl);
  if (artifact.protocol !== "https:" || !isTrustedWordHost(artifact.hostname)) {
    throw new TypeError("artifactUrl must use a trusted SharePoint or OneDrive host.");
  }
  return {
    artifactUrl: artifact.toString(),
    title: typeof title === "string" && title.trim() ? title.trim() : documentTitleFromUrl(artifact.toString())
  };
}
async function handleWordUiMcpRequest({
  request,
  response,
  requestUrl,
  cardHtml,
  wordViewerHost: wordViewerHost2
}) {
  if (requestUrl.pathname !== "/ui-mcp") {
    return false;
  }
  if (request.method === "GET") {
    response.statusCode = 405;
    response.setHeader("allow", "POST, DELETE");
    response.end();
    return true;
  }
  if (request.method === "DELETE") {
    response.statusCode = 202;
    response.end();
    return true;
  }
  if (request.method !== "POST") {
    writeJsonError(response, 405, "Method not allowed");
    return true;
  }
  const body = await readRequestBody(request);
  let message;
  try {
    message = JSON.parse(body.toString("utf8"));
  } catch {
    writeJsonError(response, 400, "Invalid JSON-RPC request");
    return true;
  }
  if (Array.isArray(message)) {
    writeJsonError(response, 400, "Batch requests are not supported");
    return true;
  }
  if (message.method === "notifications/initialized") {
    response.statusCode = 202;
    response.end();
    return true;
  }
  if (message.id === void 0) {
    response.statusCode = 202;
    response.end();
    return true;
  }
  if (message.method === "initialize") {
    writeRpcResult(response, message.id, {
      protocolVersion: MCP_PROTOCOL_VERSION2,
      capabilities: {
        resources: {},
        tools: {}
      },
      serverInfo: {
        name: "word-agent-ui-mcp",
        version: "0.1.0"
      }
    });
    return true;
  }
  if (message.method === "ping") {
    writeRpcResult(response, message.id, {});
    return true;
  }
  if (message.method === "tools/list") {
    writeRpcResult(response, message.id, {
      tools: [
        {
          name: WORD_CARD_TOOL,
          title: "Show Word document card",
          description: "Publish a persistent Word card in chat after creating or editing a document.",
          inputSchema: {
            type: "object",
            properties: {
              artifactUrl: {
                type: "string",
                description: "Canonical HTTPS SharePoint or OneDrive document URL."
              },
              title: {
                type: "string",
                description: "Document file name shown on the card."
              }
            },
            required: ["artifactUrl"],
            additionalProperties: false
          },
          _meta: {
            ui: {
              resourceUri: WORD_CARD_URI,
              visibility: ["model"]
            }
          }
        },
        {
          name: WORD_CARD_DATA_TOOL,
          description: "Load document metadata and a preview thumbnail for the Word card.",
          inputSchema: {
            type: "object",
            properties: {
              artifactUrl: { type: "string" },
              title: { type: "string" }
            },
            required: ["artifactUrl"],
            additionalProperties: false
          },
          _meta: {
            ui: {
              visibility: ["app"]
            }
          }
        }
      ]
    });
    return true;
  }
  if (message.method === "resources/list") {
    writeRpcResult(response, message.id, {
      resources: [{
        uri: WORD_CARD_URI,
        name: "Word document card",
        description: "Persistent controls for reopening a Word document.",
        mimeType: "text/html;profile=mcp-app"
      }]
    });
    return true;
  }
  if (message.method === "resources/read" && message.params?.uri === WORD_CARD_URI) {
    writeRpcResult(response, message.id, {
      contents: [{
        uri: WORD_CARD_URI,
        mimeType: "text/html;profile=mcp-app",
        text: cardHtml,
        _meta: {
          ui: {
            csp: {
              connectDomains: [],
              resourceDomains: [],
              frameDomains: []
            }
          }
        }
      }]
    });
    return true;
  }
  if (message.method === "tools/call" && message.params?.name === WORD_CARD_TOOL) {
    try {
      const document = validateCardDocument(
        message.params.arguments?.artifactUrl,
        message.params.arguments?.title
      );
      writeRpcResult(response, message.id, {
        content: [{
          type: "text",
          text: `${document.title}
${document.artifactUrl}`
        }],
        structuredContent: {
          wordDocument: document
        }
      });
    } catch (error) {
      writeRpcError(
        response,
        message.id,
        error instanceof Error ? error.message : String(error)
      );
    }
    return true;
  }
  if (message.method === "tools/call" && message.params?.name === WORD_CARD_DATA_TOOL) {
    try {
      const cardData = await wordViewerHost2.getCardData(
        message.params.arguments?.artifactUrl,
        message.params.arguments?.title
      );
      writeRpcResult(response, message.id, {
        content: [{
          type: "text",
          text: `Word card data loaded for ${cardData.fileName}.`
        }],
        structuredContent: cardData
      });
    } catch (error) {
      writeRpcError(
        response,
        message.id,
        error instanceof Error ? error.message : String(error)
      );
    }
    return true;
  }
  writeRpcError(response, message.id, `Method not found: ${message.method}`);
  return true;
}
function parseRpcMessages2(body) {
  const text = body.toString("utf8");
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice("data:".length).trim()));
  }
}
async function readRpcResponseMessages(upstreamResponse, onServerRequest = void 0, stopWhen = void 0) {
  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return parseRpcMessages2(Buffer.from(await upstreamResponse.arrayBuffer()));
  }
  if (!upstreamResponse.body) {
    return [];
  }
  const messages = [];
  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const processEvent = async (event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice("data:".length).trim()).join("\n");
    if (!data || data === "[DONE]") {
      return false;
    }
    const message = JSON.parse(data);
    messages.push(message);
    if (message?.method && message.id !== void 0 && onServerRequest) {
      const continuationMessages = await onServerRequest(message);
      if (Array.isArray(continuationMessages)) {
        messages.push(...continuationMessages);
      }
    }
    return stopWhen?.(message) === true;
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      if (await processEvent(event)) {
        await reader.cancel();
        return messages;
      }
    }
    if (done) {
      break;
    }
  }
  if (buffer.trim()) {
    await processEvent(buffer);
  }
  return messages;
}
function clampTaskPollMs(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_TASK_POLL_MS;
  }
  return Math.max(minimum, Math.min(maximum, Math.floor(numeric)));
}
function writeSseMessage(response, message) {
  response.write(`event: message
data: ${JSON.stringify(message)}

`);
}
function writeTaskProgress(response, progressToken, progress, message) {
  if (progressToken === void 0 || progressToken === null) {
    response.write(": keepalive\n\n");
    return;
  }
  writeSseMessage(response, {
    jsonrpc: "2.0",
    method: "notifications/progress",
    params: {
      progressToken,
      progress,
      ...message ? { message } : {}
    }
  });
}
function createOfficeTaskFetch(timeoutMs) {
  return (url, init = {}) => new Promise((resolve, reject) => {
    const target = url instanceof URL ? url : new URL(url);
    const transport = target.protocol === "https:" ? https : http2;
    const headers = Object.fromEntries(new Headers(init.headers));
    const request = transport.request(target, {
      method: init.method,
      headers,
      signal: init.signal
    }, (upstreamResponse) => {
      const responseHeaders = new Headers();
      for (let index = 0; index < upstreamResponse.rawHeaders.length; index += 2) {
        responseHeaders.append(
          upstreamResponse.rawHeaders[index],
          upstreamResponse.rawHeaders[index + 1]
        );
      }
      resolve(new Response(Readable.toWeb(upstreamResponse), {
        status: upstreamResponse.statusCode,
        statusText: upstreamResponse.statusMessage,
        headers: responseHeaders
      }));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(
        `Office MCP transport timed out after ${timeoutMs} ms`
      ));
    });
    request.once("error", reject);
    if (init.body) {
      request.write(init.body);
    }
    request.end();
  });
}
async function upstreamRpc({
  upstream,
  baseHeaders,
  fetchImpl,
  method,
  params,
  sessionId,
  onServerRequest = void 0
}) {
  const id = `word-proxy-${randomUUID4()}`;
  const body = Buffer.from(JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params
  }));
  const headers = new Headers(baseHeaders);
  headers.set("content-length", String(body.length));
  if (sessionId) {
    headers.set("mcp-session-id", sessionId);
  }
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(upstream, {
      method: "POST",
      headers,
      body,
      redirect: "manual"
    });
  } catch (error) {
    throw new Error(
      `Office MCP ${method} transport failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  const nextSessionId = upstreamResponse.headers.get("mcp-session-id") ?? sessionId;
  if (!upstreamResponse.ok) {
    throw new Error(`Office MCP ${method} returned HTTP ${upstreamResponse.status}`);
  }
  const messages = await readRpcResponseMessages(
    upstreamResponse,
    onServerRequest,
    (candidate) => String(candidate?.id) === id
  );
  const message = messages.find((candidate) => String(candidate?.id) === id);
  if (!message) {
    throw new Error(`Office MCP ${method} returned no matching JSON-RPC response`);
  }
  return {
    message,
    sessionId: nextSessionId,
    upstreamResponse
  };
}
async function runManagedTaskCall({
  message,
  response,
  upstream,
  baseHeaders,
  fetchImpl,
  initialSessionId,
  sleepImpl,
  taskTimeoutMs,
  minimumPollMs,
  maximumPollMs,
  localOrigin,
  activeManagedTasks,
  pendingServerRequests,
  useUpstreamTasks
}) {
  const requestId = message.id;
  const requestKey = JSON.stringify([initialSessionId, requestId]);
  const progressToken = message.params?._meta?.progressToken;
  let sessionId = initialSessionId;
  let taskId;
  let completed = false;
  let clientClosed = false;
  let deliveredResult = false;
  const cancelTask = async () => {
    if (!taskId) {
      return;
    }
    const cancellingTaskId = taskId;
    taskId = void 0;
    await upstreamRpc({
      upstream,
      baseHeaders,
      fetchImpl,
      method: "tasks/cancel",
      params: { taskId: cancellingTaskId },
      sessionId
    }).catch(() => {
    });
  };
  response.once("close", () => {
    if (!completed) {
      clientClosed = true;
    }
  });
  const forwardedMeta = message.params._meta ? { ...message.params._meta } : void 0;
  if (forwardedMeta) {
    delete forwardedMeta.progressToken;
  }
  const taskParams = {
    name: message.params.name,
    arguments: message.params.arguments,
    ...useUpstreamTasks ? { task: { ttl: TASK_TTL_MS } } : {},
    ...forwardedMeta && Object.keys(forwardedMeta).length > 0 ? { _meta: forwardedMeta } : {}
  };
  let created;
  try {
    created = await upstreamRpc({
      upstream,
      baseHeaders,
      fetchImpl,
      method: "tools/call",
      params: taskParams,
      sessionId
    });
  } catch (error) {
    writeRpcError(
      response,
      requestId,
      error instanceof Error ? error.message : String(error)
    );
    return;
  }
  sessionId = created.sessionId;
  const task = created.message?.result?.task;
  if (!task?.taskId) {
    const correlated = {
      ...created.message,
      id: requestId,
      result: decorateWordResult(created.message?.result)
    };
    response.statusCode = 200;
    copyResponseHeaders(created.upstreamResponse, response, localOrigin);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(correlated));
    return;
  }
  taskId = task.taskId;
  activeManagedTasks.set(requestKey, {
    baseHeaders,
    sessionId,
    taskId,
    upstream
  });
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache");
  if (sessionId) {
    response.setHeader("mcp-session-id", sessionId);
  }
  response.flushHeaders();
  let progress = 0;
  let status = task.status;
  let statusMessage = task.statusMessage;
  let pollMs = clampTaskPollMs(task.pollInterval, minimumPollMs, maximumPollMs);
  const startedAt = Date.now();
  if (statusMessage) {
    writeTaskProgress(response, progressToken, ++progress, statusMessage);
  }
  try {
    while (true) {
      while (status === "working") {
        if (clientClosed) {
          return;
        }
        if (Date.now() - startedAt > taskTimeoutMs) {
          await cancelTask();
          writeSseMessage(response, {
            jsonrpc: "2.0",
            id: requestId,
            error: {
              code: -32e3,
              message: `Office task polling timed out with status '${status}'`
            }
          });
          response.end();
          return;
        }
        await sleepImpl(pollMs);
        const polled = await upstreamRpc({
          upstream,
          baseHeaders,
          fetchImpl,
          method: "tasks/get",
          params: { taskId },
          sessionId
        });
        sessionId = polled.sessionId;
        const activeTask = activeManagedTasks.get(requestKey);
        if (activeTask) {
          activeTask.sessionId = sessionId;
        }
        if (polled.message.error) {
          throw new Error(
            polled.message.error.message ?? "Office MCP tasks/get failed"
          );
        }
        const taskStatus = polled.message.result;
        status = taskStatus?.status;
        statusMessage = taskStatus?.statusMessage ?? statusMessage;
        pollMs = clampTaskPollMs(
          taskStatus?.pollInterval,
          minimumPollMs,
          maximumPollMs
        );
        writeTaskProgress(
          response,
          progressToken,
          ++progress,
          statusMessage ?? "Working..."
        );
      }
      const result = await upstreamRpc({
        upstream,
        baseHeaders,
        fetchImpl,
        method: "tasks/result",
        params: { taskId },
        sessionId,
        onServerRequest: async (serverRequest) => {
          if (serverRequest.method === "ping") {
            const body = Buffer.from(JSON.stringify({
              jsonrpc: "2.0",
              id: serverRequest.id,
              result: {}
            }));
            const headers = new Headers(baseHeaders);
            headers.set("content-length", String(body.length));
            if (sessionId) {
              headers.set("mcp-session-id", sessionId);
            }
            await fetchImpl(upstream, {
              method: "POST",
              headers,
              body,
              redirect: "manual"
            });
            return [];
          }
          const continuationMessages = await new Promise((resolve, reject) => {
            const key = JSON.stringify([initialSessionId, serverRequest.id]);
            if (pendingServerRequests.has(key)) {
              reject(new Error("Duplicate Office elicitation request."));
              return;
            }
            pendingServerRequests.set(key, {
              ownerRequestKey: requestKey,
              baseHeaders,
              sessionId,
              upstream,
              resolve,
              reject
            });
            writeSseMessage(response, serverRequest);
          });
          return continuationMessages;
        }
      });
      if (result.message.error) {
        writeSseMessage(response, {
          jsonrpc: "2.0",
          id: requestId,
          error: result.message.error
        });
        deliveredResult = true;
        completed = true;
        response.end();
        return;
      }
      const continuationTask = result.message.result?.task;
      if (continuationTask?.taskId) {
        taskId = continuationTask.taskId;
        status = continuationTask.status;
        statusMessage = continuationTask.statusMessage ?? statusMessage;
        pollMs = clampTaskPollMs(
          continuationTask.pollInterval,
          minimumPollMs,
          maximumPollMs
        );
        const activeTask = activeManagedTasks.get(requestKey);
        if (activeTask) {
          activeTask.taskId = taskId;
          activeTask.sessionId = sessionId;
        }
        writeTaskProgress(
          response,
          progressToken,
          ++progress,
          statusMessage ?? "Continuing..."
        );
        continue;
      }
      writeSseMessage(response, {
        jsonrpc: "2.0",
        id: requestId,
        result: decorateWordResult(result.message.result)
      });
      deliveredResult = true;
      completed = true;
      response.end();
      return;
    }
  } catch (error) {
    await cancelTask();
    if (!clientClosed) {
      writeSseMessage(response, {
        jsonrpc: "2.0",
        id: requestId,
        error: {
          code: -32e3,
          message: error instanceof Error ? error.message : String(error)
        }
      });
      response.end();
    }
  } finally {
    activeManagedTasks.delete(requestKey);
    for (const [id, pending] of pendingServerRequests) {
      if (pending.ownerRequestKey === requestKey) {
        pendingServerRequests.delete(id);
        pending.reject?.(new Error("Managed Office task ended before elicitation completed"));
      }
    }
    if (!deliveredResult && taskId) {
      await cancelTask();
    }
  }
}
function logTaskNegotiation(requestBody, responseBody) {
  try {
    const parsedRequest = JSON.parse(requestBody.toString("utf8"));
    const requests = Array.isArray(parsedRequest) ? parsedRequest : [parsedRequest];
    const responseText = responseBody.toString("utf8");
    let parsedResponses;
    try {
      const parsedResponse = JSON.parse(responseText);
      parsedResponses = Array.isArray(parsedResponse) ? parsedResponse : [parsedResponse];
    } catch {
      parsedResponses = responseText.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice("data:".length).trim()));
    }
    for (const request of requests) {
      const upstreamResponse = parsedResponses.find((candidate) => candidate?.id === request?.id);
      if (request?.method === "initialize") {
        console.error("[word-agent] Office MCP task capabilities:", JSON.stringify(
          upstreamResponse?.result?.capabilities?.tasks ?? null
        ));
      } else if (request?.method === "tools/list") {
        const tools = upstreamResponse?.result?.tools;
        const taskSupport = Array.isArray(tools) ? Object.fromEntries(tools.map((tool) => [
          tool?.name,
          tool?.execution?.taskSupport ?? null
        ])) : {};
        console.error("[word-agent] Office MCP tool task support:", JSON.stringify(taskSupport));
      }
    }
  } catch {
  }
}
async function startOfficeTaskProxy({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  upstreamUrl = DEFAULT_UPSTREAM_URL,
  fetchImpl = fetch,
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  taskTimeoutMs = TASK_TIMEOUT_MS,
  minimumPollMs = MIN_TASK_POLL_MS,
  maximumPollMs = MAX_TASK_POLL_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  wordViewerHost: wordViewerHost2 = createWordViewerHost({ fetchImpl }),
  conversationProvider = void 0,
  upstreamHeadersProvider = void 0,
  authorizeFetch = void 0,
  useUpstreamTasks = true
} = {}) {
  assertLoopbackBind(host);
  const clientToken = createLocalCapability();
  const upstream = new URL(upstreamUrl);
  const baseTaskFetchImpl = fetchImpl === fetch ? createOfficeTaskFetch(Math.max(TASK_TIMEOUT_MS, taskTimeoutMs)) : fetchImpl;
  const upstreamFetchImpl = authorizeFetch ? authorizeFetch(fetchImpl) : fetchImpl;
  const taskFetchImpl = authorizeFetch ? authorizeFetch(baseTaskFetchImpl) : baseTaskFetchImpl;
  const activeManagedTasks = /* @__PURE__ */ new Map();
  const pendingServerRequests = /* @__PURE__ */ new Map();
  const cardHtml = await readFile3(WORD_CARD_PATH, "utf8");
  let activeRequests = 0;
  let idleTimer;
  let lastActivityAt = Date.now();
  const loopbackHosts = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1"]);
  if (upstream.protocol !== "https:" && !loopbackHosts.has(upstream.hostname)) {
    throw new Error("Office task proxy upstream must use HTTPS or a loopback host");
  }
  const server = http2.createServer(async (request, response) => {
    activeRequests += 1;
    lastActivityAt = Date.now();
    let released = false;
    const releaseRequest = () => {
      if (released) {
        return;
      }
      released = true;
      activeRequests -= 1;
      lastActivityAt = Date.now();
      scheduleIdleShutdown();
    };
    response.once("finish", releaseRequest);
    response.once("close", releaseRequest);
    const requestUrl = localRequestUrl(request, response);
    if (!requestUrl) return;
    const publicRequest = requestUrl.pathname.startsWith("/viewer/session/") || ["/viewer/viewer.bundle.js", "/viewer/viewer.bundle.css"].includes(requestUrl.pathname);
    if (!publicRequest && !hasLocalCapability(request, clientToken)) {
      denyLocalRequest(response);
      return;
    }
    if (request.method === "POST" && ["/mcp", "/ui-mcp"].includes(requestUrl.pathname) && !requireJsonRequest(request, response)) return;
    if (await wordViewerHost2.handleRequest(request, response, requestUrl)) {
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      response.statusCode = 204;
      response.setHeader("x-word-agent-proxy", "1");
      response.end();
      return;
    }
    try {
      if (await handleWordUiMcpRequest({
        request,
        response,
        requestUrl,
        cardHtml,
        wordViewerHost: wordViewerHost2
      })) {
        return;
      }
    } catch (error) {
      if (error instanceof RangeError) {
        writeJsonError(response, 413, error.message);
      } else {
        writeJsonError(
          response,
          500,
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === OAUTH_RESOURCE_METADATA_PATH) {
      try {
        const metadataUrl = new URL(
          `/.well-known/oauth-protected-resource${upstream.pathname}`,
          upstream.origin
        );
        const upstreamResponse = await fetchImpl(metadataUrl, {
          headers: { accept: "application/json" },
          redirect: "manual"
        });
        const metadata = await upstreamResponse.json();
        metadata.resource = `${requestUrl.origin}/mcp`;
        response.statusCode = upstreamResponse.status;
        copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(metadata));
      } catch (error) {
        writeJsonError(
          response,
          502,
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }
    if (requestUrl.pathname !== "/mcp" || !["POST", "GET", "DELETE"].includes(request.method ?? "")) {
      writeJsonError(response, 404, "Not found");
      return;
    }
    if (request.method === "GET") {
      response.statusCode = 405;
      response.setHeader("allow", "POST, DELETE");
      response.end();
      return;
    }
    try {
      const rawBody = request.method === "GET" ? Buffer.alloc(0) : await readRequestBody(request);
      let body = augmentInitializeRequest(rawBody);
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(body.toString("utf8"));
      } catch {
        parsedMessage = null;
      }
      if (request.method === "POST" && !isJsonRpcPayload(parsedMessage)) {
        writeJsonError(response, 400, "Invalid JSON-RPC request.");
        return;
      }
      const isWordToolCall = request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && WORD_TASK_TOOLS.has(parsedMessage?.params?.name);
      if (isWordToolCall) {
        removeUntrustedUserRequest(parsedMessage);
        if (conversationProvider) {
          addConversationMetadata(
            parsedMessage,
            await conversationProvider()
          );
        }
        body = Buffer.from(JSON.stringify(parsedMessage));
      }
      const headers = forwardedRequestHeaders(request.headers, body.length);
      if (!headers.has("x-client-metadata")) {
        headers.set("x-client-metadata", OFFICE_CLIENT_METADATA);
      }
      if (upstreamHeadersProvider) {
        const upstreamHeaders = await upstreamHeadersProvider();
        for (const [name, value] of Object.entries(upstreamHeaders)) {
          headers.set(name, String(value));
        }
      }
      if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === void 0 && parsedMessage?.id !== void 0 && pendingServerRequests.has(JSON.stringify([request.headers["mcp-session-id"], parsedMessage.id]))) {
        const key = JSON.stringify([request.headers["mcp-session-id"], parsedMessage.id]);
        const pending = pendingServerRequests.get(key);
        pendingServerRequests.delete(key);
        const responseHeaders = new Headers(pending.baseHeaders);
        responseHeaders.set("content-length", String(body.length));
        if (pending.sessionId) {
          responseHeaders.set("mcp-session-id", pending.sessionId);
        }
        try {
          const upstreamResponse2 = await upstreamFetchImpl(pending.upstream, {
            method: "POST",
            headers: responseHeaders,
            body,
            redirect: "manual"
          });
          const continuationMessages = await readRpcResponseMessages(upstreamResponse2);
          pending.resolve(continuationMessages);
          response.statusCode = 202;
          response.end();
        } catch (error) {
          pending.reject(error);
          writeRpcError(
            response,
            parsedMessage.id,
            error instanceof Error ? error.message : String(error)
          );
        }
        return;
      }
      if (request.method === "POST" && parsedMessage?.method === void 0 && parsedMessage?.id !== void 0) {
        writeJsonError(response, 409, "No pending request for this MCP session.");
        return;
      }
      if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "notifications/cancelled") {
        const activeTask = activeManagedTasks.get(
          JSON.stringify([request.headers["mcp-session-id"], parsedMessage?.params?.requestId])
        );
        if (activeTask) {
          await upstreamRpc({
            upstream: activeTask.upstream,
            baseHeaders: activeTask.baseHeaders,
            fetchImpl: upstreamFetchImpl,
            method: "tasks/cancel",
            params: { taskId: activeTask.taskId },
            sessionId: activeTask.sessionId
          });
        }
        response.statusCode = 202;
        response.end();
        return;
      }
      if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && WORD_TASK_TOOLS.has(parsedMessage?.params?.name) && parsedMessage.id !== void 0) {
        await runManagedTaskCall({
          message: parsedMessage,
          response,
          upstream,
          baseHeaders: headers,
          fetchImpl: taskFetchImpl,
          initialSessionId: request.headers["mcp-session-id"],
          sleepImpl,
          taskTimeoutMs,
          minimumPollMs,
          maximumPollMs,
          localOrigin: requestUrl.origin,
          activeManagedTasks,
          pendingServerRequests,
          useUpstreamTasks
        });
        return;
      }
      const upstreamResponse = await upstreamFetchImpl(upstream, {
        method: request.method,
        headers,
        body: request.method === "GET" ? void 0 : body,
        redirect: "manual"
      });
      if (request.method === "GET" && upstreamResponse.body) {
        response.statusCode = upstreamResponse.status;
        copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
        const reader = upstreamResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          response.write(Buffer.from(value));
        }
        response.end();
        return;
      }
      response.statusCode = upstreamResponse.status;
      copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      logTaskNegotiation(body, responseBody);
      response.end(transformRpcResponseBody(body, responseBody));
    } catch (error) {
      if (error instanceof RangeError) {
        writeJsonError(response, 413, error.message);
        return;
      }
      writeJsonError(
        response,
        502,
        error instanceof Error ? error.message : String(error)
      );
    }
  });
  function scheduleIdleShutdown() {
    clearTimeout(idleTimer);
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
      return;
    }
    const idleFor = Date.now() - lastActivityAt;
    idleTimer = setTimeout(() => {
      const hasViewerLease = wordViewerHost2.hasActiveSessions?.() === true;
      if (activeRequests > 0 || activeManagedTasks.size > 0 || pendingServerRequests.size > 0 || hasViewerLease || Date.now() - lastActivityAt < idleTimeoutMs) {
        lastActivityAt = Date.now();
        scheduleIdleShutdown();
        return;
      }
      server.close();
    }, Math.max(1, idleTimeoutMs - idleFor));
    idleTimer.unref();
  }
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
  const address2 = server.address();
  const listeningPort = typeof address2 === "object" && address2 ? address2.port : port;
  const proxyServer2 = Object.assign(server, {
    clientToken,
    createWordViewerUrl(artifactUrl, title, mode = "view", instanceId = void 0) {
      return wordViewerHost2.createViewerUrl(
        `http://${host}:${listeningPort}`,
        artifactUrl,
        title,
        mode,
        instanceId
      );
    }
  });
  server.once("close", () => {
    clearTimeout(idleTimer);
    wordViewerHost2.resetAuthSessions?.();
  });
  scheduleIdleShutdown();
  return proxyServer2;
}
var officeTaskProxyDefaults = Object.freeze({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  upstreamUrl: DEFAULT_UPSTREAM_URL,
  protocolVersion: MCP_PROTOCOL_VERSION2,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS
});

// src/runtime/auth/renewable-office-fetch.ts
function createRenewableOfficeFetch2(fetchImpl, officeTokenProvider2, onUnauthorized) {
  return createRenewableOfficeFetch(fetchImpl, officeTokenProvider2, onUnauthorized, WORD_AUTH_PRODUCT);
}

// src/runtime/session-conversation.ts
var MAX_USER_TURNS = 20;
var MAX_MESSAGE_BYTES = 256 * 1024;
var MAX_CONVERSATION_BYTES = 512 * 1024;
var MAX_INVOCATION_BYTES = 64 * 1024;
var TRUNCATION_MARKER = "\n[truncated by Word plugin conversation handoff]";
function truncateUtf8(value, maximumBytes) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") <= maximumBytes) {
    return value;
  }
  const contentBudget = maximumBytes - Buffer.byteLength(TRUNCATION_MARKER, "utf8");
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), "utf8") <= contentBudget) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${value.slice(0, low)}${TRUNCATION_MARKER}`;
}
function serializeToolInvocation(start) {
  const name = start?.data?.mcpToolName || start?.data?.toolName || "unknown";
  const invocation = JSON.stringify({
    name,
    arguments: start?.data?.arguments ?? {}
  });
  if (Buffer.byteLength(invocation, "utf8") <= MAX_INVOCATION_BYTES) {
    return invocation;
  }
  return JSON.stringify({
    name,
    arguments: {
      _truncated: "Tool arguments exceeded the conversation handoff limit."
    }
  });
}
function serializeToolResult(complete) {
  if (complete?.data?.result?.content) {
    return complete.data.result.content;
  }
  if (complete?.data?.error?.message) {
    return complete.data.error.message;
  }
  return complete?.data?.success ? "Tool completed without a text result." : "Tool execution failed without an error message.";
}
function toMessageAnnotations(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return void 0;
  }
  return attachments.map((attachment) => {
    const {
      data: _data,
      content: _content,
      ...metadata
    } = attachment;
    return metadata;
  });
}
function boundConversation(messages) {
  let userTurns = 0;
  let firstMessage = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].author !== "user") {
      continue;
    }
    userTurns += 1;
    if (userTurns > MAX_USER_TURNS) {
      firstMessage = index + 1;
      break;
    }
  }
  const selected = [];
  let totalBytes = 2;
  for (let index = messages.length - 1; index >= firstMessage; index -= 1) {
    const message = messages[index];
    const messageBytes = Buffer.byteLength(JSON.stringify(message), "utf8");
    if (totalBytes + messageBytes > MAX_CONVERSATION_BYTES) {
      break;
    }
    selected.unshift(message);
    totalBytes += messageBytes + 1;
  }
  return selected;
}
function toOfficeConversation(events) {
  const toolStarts = /* @__PURE__ */ new Map();
  const conversation = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.agentId || event?.ephemeral) {
      continue;
    }
    if (event.type === "tool.execution_start") {
      toolStarts.set(event.data?.toolCallId, event);
      continue;
    }
    if (event.type === "user.message") {
      if (!event.data?.content) {
        continue;
      }
      conversation.push({
        author: "user",
        text: truncateUtf8(event.data.content, MAX_MESSAGE_BYTES),
        createdAt: event.timestamp,
        messageId: event.id,
        requestId: event.data.interactionId,
        messageAnnotations: toMessageAnnotations(event.data.attachments)
      });
      continue;
    }
    if (event.type === "assistant.message") {
      const phase = event.data?.phase?.toLowerCase();
      if (!event.data?.content || phase && phase !== "response" && phase !== "final") {
        continue;
      }
      conversation.push({
        author: "bot",
        text: truncateUtf8(event.data.content, MAX_MESSAGE_BYTES),
        createdAt: event.timestamp,
        messageId: event.data.messageId || event.id,
        requestId: event.data.requestId || event.data.turnId
      });
      continue;
    }
    if (event.type === "tool.execution_complete") {
      const start = toolStarts.get(event.data?.toolCallId);
      if (!start) {
        continue;
      }
      const result = truncateUtf8(
        serializeToolResult(event),
        MAX_MESSAGE_BYTES
      );
      const toolName = start.data?.mcpToolName || start.data?.toolName || "tool";
      conversation.push({
        author: "bot",
        text: `${toolName} completed.`,
        createdAt: event.timestamp,
        messageType: "InternalSearchResult",
        contentOrigin: "Tool",
        hiddenText: result,
        invocation: serializeToolInvocation(start),
        messageId: event.data.toolCallId,
        requestId: event.data.turnId || start.data?.turnId
      });
    }
  }
  return boundConversation(conversation);
}

// src/runtime/document-upload.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import { Readable as Readable2 } from "node:stream";
var DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
var ZIP_SIGNATURE = Buffer.from([80, 75, 3, 4]);
var MAX_UPLOAD_BYTES = 25e7;
var UploadError = class extends Error {
};
function targetName(path) {
  const name = basename(path);
  const stem = name.slice(0, -extname(name).length);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:.]/g, "");
  const suffix = `-${stamp}-${randomUUID5()}.docx`;
  return `Copilot-${stem.slice(0, Math.max(1, 255 - "Copilot-".length - suffix.length))}${suffix}`;
}
async function validateDocument(path) {
  if (extname(path).toLowerCase() !== ".docx") {
    throw new UploadError("Only .docx documents can be uploaded.");
  }
  const details = await stat(path);
  if (!details.isFile() || details.size < ZIP_SIGNATURE.length || details.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`The document must be a file between 4 and ${MAX_UPLOAD_BYTES} bytes.`);
  }
  const file = await open(path, "r");
  try {
    const signature = Buffer.alloc(ZIP_SIGNATURE.length);
    await file.read(signature, 0, signature.length, 0);
    if (!signature.equals(ZIP_SIGNATURE)) {
      throw new UploadError("Only ZIP-based, unencrypted .docx documents can be uploaded.");
    }
  } finally {
    await file.close();
  }
  return details.size;
}
function createDocumentUploader({
  getGraphToken,
  fetchImpl = fetch,
  onUnauthorized
}) {
  return async function uploadDocument2(path) {
    if (typeof path !== "string" || !path.trim()) {
      throw new UploadError("A local .docx path is required.");
    }
    const resolvedPath = path.trim();
    if (!isAbsolute(resolvedPath)) {
      throw new UploadError("An absolute local .docx path is required.");
    }
    const size = await validateDocument(resolvedPath);
    const name = targetName(resolvedPath);
    const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`;
    let claims;
    let rejectedToken;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getGraphToken({
        forceRefresh: attempt > 0,
        ...claims ? { claims } : {},
        ...rejectedToken ? { rejectedToken } : {}
      });
      const input = createReadStream(resolvedPath);
      const closed = new Promise((resolve) => input.once("close", resolve));
      let response;
      try {
        response = await fetchImpl(url, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": DOCX_CONTENT_TYPE,
            "content-length": String(size),
            accept: "application/json"
          },
          body: Readable2.toWeb(input),
          duplex: "half",
          redirect: "manual"
        });
      } catch {
        throw new UploadError(
          `The OneDrive upload could not be confirmed. Check for '${name}' before retrying; the upload was not replayed.`
        );
      } finally {
        input.destroy();
        await closed;
      }
      if (response.status === 401 && attempt === 0) {
        rejectedToken = token;
        try {
          claims = claimsFromResponse(response);
        } finally {
          await response.body?.cancel();
        }
        continue;
      }
      if (response.status === 401) {
        try {
          onUnauthorized?.(claimsFromResponse(response) ?? claims);
        } finally {
          await response.body?.cancel();
        }
        throw new AuthError("interaction_required", "Reconnect your Word account to authorize the OneDrive upload.", GRAPH_SCOPE);
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 403) {
          throw new AuthError("access_denied", "The selected account cannot upload documents to this OneDrive.", GRAPH_SCOPE);
        }
        throw new UploadError(`Microsoft Graph rejected the upload (HTTP ${response.status}).`);
      }
      const result = await response.json();
      if (typeof result?.webUrl !== "string" || typeof result?.name !== "string") {
        throw new UploadError(`OneDrive accepted '${name}', but did not return valid document metadata.`);
      }
      return { id: result.id, name: result.name, webUrl: result.webUrl };
    }
    throw new UploadError("Microsoft Graph did not authorize the upload.");
  };
}

// ../shared/runtime/state-directory.ts
import { homedir } from "node:os";
import { join as join6 } from "node:path";
function userStateDirectory(fallbackDirectory, {
  platform = process.platform,
  home = homedir(),
  localAppData = process.env.LOCALAPPDATA
} = {}) {
  return platform === "darwin" ? join6(home, "Library", "Application Support") : localAppData ?? fallbackDirectory;
}

// ../shared/runtime/office-request-metadata.ts
var OVERRIDE_KEYS = /* @__PURE__ */ new Set([
  "flights",
  "variants",
  "isEvalRequest",
  "isTestTraffic",
  "localOfficePyBaseUrl",
  "dateTimeOverride",
  "microsoft.sydney.dateTimeOverride",
  "writeAllowed",
  "sharedDocumentWriteAllowed"
]);
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cleanMetadata(value) {
  if (!record(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !OVERRIDE_KEYS.has(key)).map(([key, entry]) => [key, key === "xMetadata" ? cleanMetadata(entry) : entry]));
}
function slotSelectors(value, separator, pattern) {
  if (typeof value !== "string") return void 0;
  return value.split(separator).map((entry) => entry.trim()).filter((entry) => pattern.test(entry)).join(separator) || void 0;
}
function cleanProtocolMetadata(value) {
  const cleaned = cleanMetadata(value);
  if (!record(value) || !record(cleaned)) return cleaned;
  const flights = slotSelectors(value.flights, ";", /^OfficeAgent\.useMCPExperiment[1-8]:true$/i);
  const variants = slotSelectors(value.variants, ",", /^feature\.UseOfficeAgentMCPExperiment[1-8]$/);
  return {
    ...cleaned,
    ...flights ? { flights } : {},
    ...variants ? { variants } : {}
  };
}
function sanitizeOfficeRequest(body) {
  let input;
  try {
    input = JSON.parse(body.toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return body;
    throw error;
  }
  const clean = (message) => {
    if (!record(message) || !record(message.params)) return message;
    return {
      ...message,
      params: {
        ...message.params,
        ...Object.hasOwn(message.params, "_meta") ? { _meta: cleanProtocolMetadata(message.params._meta) } : {},
        ...Object.hasOwn(message.params, "arguments") ? { arguments: cleanMetadata(message.params.arguments) } : {}
      }
    };
  };
  return Buffer.from(JSON.stringify(Array.isArray(input) ? input.map(clean) : clean(input)));
}
function sanitizeOfficeHeaders(headers) {
  headers.delete("x-variants");
  const value = headers.get("x-client-metadata");
  if (value !== null) {
    let metadata;
    try {
      metadata = JSON.parse(value);
    } catch (error) {
      throw new Error("Office client metadata must be valid JSON.", { cause: error });
    }
    if (!record(metadata)) throw new Error("Office client metadata must be an object.");
    headers.set("x-client-metadata", JSON.stringify(cleanMetadata(metadata)));
  }
}
function createOfficeMetadataFetch(transport) {
  return async (input, init) => {
    if (input instanceof Request) {
      throw new Error("Office metadata transport requires an explicit URL and request options.");
    }
    const headers = new Headers(init?.headers);
    sanitizeOfficeHeaders(headers);
    const body = init?.body;
    if (body === void 0 || body === null) {
      return transport(input, { ...init, headers });
    }
    if (typeof body !== "string" && !(body instanceof Uint8Array)) {
      throw new Error("Office metadata transport requires a buffered MCP request.");
    }
    const sanitized = sanitizeOfficeRequest(Buffer.from(body));
    if (headers.has("content-length")) headers.set("content-length", String(sanitized.length));
    return transport(input, { ...init, headers, body: sanitized.toString("utf8") });
  };
}

// src/extension.ts
var OFFICE_MCP_URL = "https://dogfood.augloop.svc.cloud.microsoft/mcp/office-agent-mcp";
var OFFICE_MCP_TIMEOUT_MS = 30 * 60 * 1e3;
var GENERATE_TASK_DESCRIPTION = "Describe the Word document to create in the user's own terms. Preserve every requested fact, source constraint, section, tone, formatting requirement, and later refinement. Do not invent content or sources, add placeholders, or add requirements the user did not request. The Word capability owns document structure, prose, layout, and formatting.";
var EDIT_TASK_DESCRIPTION = "Describe only the edits to apply to the existing Word document, in the user's own terms, including what must not change. Preserve requested text, source constraints, tone, and formatting. Do not restate unchanged content, invent content or sources, add placeholders, or add requirements the user did not request. The Word capability reads the existing document and owns the implementation.";
var session;
var authDirectory = join7(
  userStateDirectory(fileURLToPath3(new URL(".", import.meta.url))),
  "WordCopilot",
  "auth"
);
var nativeAuthProvider = createNativeAuthProvider2({
  workerPath: fileURLToPath3(new URL("./auth/auth-worker.cjs", import.meta.url))
});
var auth = createAccountAuth2({
  selectionPath: join7(authDirectory, "selection.json"),
  provider: nativeAuthProvider
});
var authInitializationWarning;
try {
  await auth.initialize();
  await nativeAuthProvider({ operation: "validate", scope: OFFICE_SCOPE });
} catch (error) {
  authInitializationWarning = error instanceof Error ? error.message : "Word authentication is unavailable. Connect again to retry it.";
}
var authStatus = () => ({
  ...auth.status(),
  ...authInitializationWarning ? { warning: authInitializationWarning } : {}
});
var officeTokenProvider = (options = {}) => auth.getToken(OFFICE_SCOPE, options);
var wordViewerHost = createWordViewerHost({
  resourceTokenProvider: (scope, options) => auth.getToken(scope, options),
  authStatus,
  onUnauthorized: (scope, claims) => auth.requireInteraction(scope, claims)
});
auth.configureCoordination({ onAccountChanged: () => wordViewerHost.resetAuthSessions() });
var uploadDocument = createDocumentUploader({
  getGraphToken: (options) => auth.getToken(GRAPH_SCOPE, options),
  onUnauthorized: (claims) => auth.requireInteraction(GRAPH_SCOPE, claims)
});
var proxyServer = await startOfficeTaskProxy({
  port: 0,
  upstreamUrl: OFFICE_MCP_URL,
  idleTimeoutMs: 0,
  useUpstreamTasks: false,
  authorizeFetch: (transport) => createOfficeMetadataFetch(createRenewableOfficeFetch2(
    transport,
    officeTokenProvider,
    (claims) => auth.requireInteraction(OFFICE_SCOPE, claims)
  )),
  wordViewerHost,
  conversationProvider: async () => {
    if (!session) {
      throw new Error("The Copilot session is not ready to provide conversation history.");
    }
    return {
      conversationId: session.sessionId,
      conversationSchemaVersion: "2",
      conversation: toOfficeConversation(await session.getEvents())
    };
  }
});
var address = proxyServer.address();
if (!address || typeof address === "string") {
  proxyServer.close();
  throw new Error("The Word MCP proxy did not expose a loopback port.");
}
var proxyOrigin = `http://127.0.0.1:${address.port}`;
proxyServer.unref();
function callWordTool(name, args) {
  return callLocalMcpTool({
    origin: proxyOrigin,
    clientToken: proxyServer.clientToken,
    path: "/mcp",
    name,
    args: {
      ...args,
      appName: "Word"
    },
    timeoutMs: OFFICE_MCP_TIMEOUT_MS
  });
}
async function createWordViewerUrl(artifactUrl, title, mode, instanceId) {
  return proxyServer.createWordViewerUrl(artifactUrl, title, mode, instanceId);
}
try {
  session = await joinSession({
    enableMcpApps: true,
    mcpServers: {
      "word-agent-ui-mcp": {
        type: "http",
        url: `${proxyOrigin}/ui-mcp`,
        headers: { [LOCAL_CAPABILITY_HEADER]: proxyServer.clientToken }
      }
    },
    tools: [
      {
        name: "word_account_status",
        description: "Show the Word plugin's selected Microsoft 365 account and sign-in status. Returns no tokens.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => authStatus()
      },
      {
        name: "connect_word_account",
        description: "Explicitly connect or reauthenticate with Microsoft's native account provider. For first connection, ask the user for their Microsoft 365 username in Copilot and pass it here. Never guesses an account or changes a pinned identity; Microsoft alone handles passwords, consent, and MFA.",
        parameters: {
          type: "object",
          properties: {
            tenantId: { type: "string", description: "Optional work/school tenant GUID." },
            username: { type: "string", description: "User-provided Microsoft 365 username, required on first connection. Omit when reauthenticating an already pinned account." }
          },
          additionalProperties: false
        },
        handler: async (args) => {
          const result = await auth.connect(args);
          authInitializationWarning = void 0;
          wordViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "switch_word_account",
        description: "Choose a different account through Microsoft's native account provider using a username explicitly supplied by the user in Copilot. Invalidates existing viewers. Does not change the OS account.",
        parameters: {
          type: "object",
          properties: {
            tenantId: { type: "string", description: "Optional work/school tenant GUID." },
            username: { type: "string", description: "User-provided Microsoft 365 username for the account to select. Never infer this value." }
          },
          required: ["username"],
          additionalProperties: false
        },
        handler: async (args) => {
          const result = await auth.connect({ ...args, switchAccount: true });
          authInitializationWarning = void 0;
          wordViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "disconnect_word_account",
        description: "Disconnect the Word plugin and clear its selected identity and in-memory token cache. Does not sign out the OS account or other Office applications.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => {
          const result = await auth.disconnect();
          authInitializationWarning = void 0;
          wordViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "upload_word_document",
        description: "Upload an explicitly named local .docx document to the connected Word account's OneDrive for editing. Creates a uniquely named copy and never modifies the local file.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the local .docx document supplied by the user.",
              minLength: 1
            }
          },
          required: ["path"],
          additionalProperties: false
        },
        handler: async (args) => uploadDocument(args.path)
      },
      {
        name: "generate_word_document",
        description: "Create a new Word document with the Word agent. Use this instead of scripts, document libraries, or raw MCP requests.",
        parameters: {
          type: "object",
          properties: {
            taskDescription: {
              type: "string",
              description: GENERATE_TASK_DESCRIPTION,
              minLength: 1
            }
          },
          required: ["taskDescription"],
          additionalProperties: false
        },
        handler: async (args) => callWordTool("generate_artifact", args)
      },
      {
        name: "edit_word_document",
        description: "Edit an existing SharePoint or OneDrive Word document with the Word agent. Use this instead of scripts, document libraries, or raw MCP requests.",
        parameters: {
          type: "object",
          properties: {
            artifactUrl: {
              type: "string",
              description: "Canonical HTTPS SharePoint or OneDrive document URL.",
              minLength: 1
            },
            taskDescription: {
              type: "string",
              description: EDIT_TASK_DESCRIPTION,
              minLength: 1
            }
          },
          required: ["artifactUrl", "taskDescription"],
          additionalProperties: false
        },
        handler: async (args) => callWordTool("edit_artifact", args)
      },
      {
        name: "open_word_canvas",
        description: "Open or focus a trusted SharePoint or OneDrive Word document in the Copilot app canvas.",
        parameters: {
          type: "object",
          properties: {
            artifactUrl: {
              type: "string",
              description: "Canonical HTTPS SharePoint or OneDrive document URL."
            },
            title: {
              type: "string",
              description: "Optional document name shown in the canvas header."
            },
            instanceId: {
              type: "string",
              description: "Stable canvas instance identifier."
            },
            mode: {
              type: "string",
              enum: ["view", "edit"],
              description: "Open read-only preview mode or editable Word mode. Defaults to view."
            }
          },
          required: ["artifactUrl"],
          additionalProperties: false
        },
        handler: async (args) => session.rpc.canvas.open({
          canvasId: "word-canvas",
          instanceId: args.instanceId || `word-document-${args.mode || "view"}`,
          input: {
            artifactUrl: args.artifactUrl,
            title: args.title,
            mode: args.mode || "view"
          }
        })
      }
    ],
    canvases: [
      createCanvas({
        id: "word-canvas",
        displayName: "Word",
        description: "Open an Office MCP Word artifact in the Copilot app canvas.",
        inputSchema: {
          type: "object",
          properties: {
            artifactUrl: {
              type: "string",
              description: "Canonical HTTPS SharePoint or OneDrive URL returned by Office MCP.",
              minLength: 1
            },
            title: {
              type: "string",
              description: "Optional document name shown in the canvas header."
            },
            mode: {
              type: "string",
              enum: ["view", "edit"],
              description: "Read-only preview or editable Word mode.",
              default: "view"
            }
          },
          required: ["artifactUrl"],
          additionalProperties: false
        },
        actions: [
          {
            name: "refresh_document",
            description: "Refresh the currently open Word canvas after the document changes.",
            handler: async () => ({
              refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
            })
          }
        ],
        onClose: (ctx) => wordViewerHost.revokeInstance(ctx.instanceId),
        open: async (ctx) => {
          let url;
          try {
            url = await createWordViewerUrl(
              ctx.input?.artifactUrl,
              ctx.input?.title,
              ctx.input?.mode || "view",
              ctx.instanceId
            );
          } catch (error) {
            throw new CanvasError(
              "invalid_word_url",
              error instanceof Error ? error.message : String(error)
            );
          }
          const title = typeof ctx.input?.title === "string" && ctx.input.title.trim() ? ctx.input.title.trim() : "Word";
          return {
            title,
            status: ctx.input?.mode === "edit" ? "Opening authenticated Word editor" : "Opening Word preview",
            url
          };
        }
      })
    ]
  });
} catch (error) {
  proxyServer.close();
  throw error;
}
