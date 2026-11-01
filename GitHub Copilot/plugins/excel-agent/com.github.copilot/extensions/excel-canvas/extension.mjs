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

// ../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/polyfills.js"(exports, module) {
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

// ../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/legacy-streams.js"(exports, module) {
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

// ../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/clone.js"(exports, module) {
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

// ../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "../../../node_modules/.pnpm/graceful-fs@4.2.11/node_modules/graceful-fs/graceful-fs.js"(exports, module) {
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
      fs2.createReadStream = createReadStream;
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
        open(that.path, that.flags, that.mode, function(err, fd) {
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
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path, options) {
        return new fs2.ReadStream(path, options);
      }
      function createWriteStream(path, options) {
        return new fs2.WriteStream(path, options);
      }
      var fs$open = fs2.open;
      fs2.open = open;
      function open(path, flags, mode, cb) {
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

// ../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry_operation.js"(exports, module) {
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

// ../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/lib/retry.js"(exports) {
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

// ../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js
var require_retry2 = __commonJS({
  "../../../node_modules/.pnpm/retry@0.12.0/node_modules/retry/index.js"(exports, module) {
    module.exports = require_retry();
  }
});

// ../../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "../../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/signals.js"(exports, module) {
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

// ../../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "../../../node_modules/.pnpm/signal-exit@3.0.7/node_modules/signal-exit/index.js"(exports, module) {
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

// ../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/mtime-precision.js"(exports, module) {
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

// ../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/lockfile.js"(exports, module) {
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

// ../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/lib/adapter.js"(exports, module) {
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

// ../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "../../../node_modules/.pnpm/proper-lockfile@4.1.2/node_modules/proper-lockfile/index.js"(exports, module) {
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

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule) => shouldUseRule(schema, rule));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule) {
      var _a;
      return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// ../../../node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "../../../node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// ../../../node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "../../../node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type } = rule.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// ../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isPort = RegExp.prototype.test.bind(/^\d*$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
    var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
    var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
    var BYTE_HEX = new Array(256);
    {
      const HEX_DIGITS = "0123456789ABCDEF";
      for (let i = 0; i < 256; i++) {
        BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
      }
    }
    function percentEncodeNonAscii(cp) {
      if (cp < 2048) {
        return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
      }
      if (cp < 65536) {
        return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
      }
      return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
    var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
    var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function isZoneIdentifier(zone) {
      if (zone.length === 0) return false;
      for (let i = 0; i < zone.length; i++) {
        if (isZoneCharacter(zone[i])) continue;
        if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
          i += 2;
          continue;
        }
        return false;
      }
      return true;
    }
    function compressIPv6ZeroRun(hextets) {
      let bestStart = -1;
      let bestLength = 0;
      let runStart = -1;
      let runLength = 0;
      for (let i = 0; i < hextets.length; i++) {
        if (hextets[i] === "0") {
          if (runStart === -1) runStart = i;
          runLength++;
          if (runLength > bestLength) {
            bestLength = runLength;
            bestStart = runStart;
          }
        } else {
          runStart = -1;
          runLength = 0;
        }
      }
      if (bestLength < 2) return hextets.join(":");
      const head = hextets.slice(0, bestStart).join(":");
      const tail = hextets.slice(bestStart + bestLength).join(":");
      return head + "::" + tail;
    }
    function normalizeIPv6Address(input) {
      const compression = input.indexOf("::");
      if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
      const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
      const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
      if (compression !== -1) {
        if (left.length === 1 && left[0] === "") left.length = 0;
        if (right.length === 1 && right[0] === "") right.length = 0;
      }
      const parts = left.concat(right);
      let hextetCount = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") return void 0;
        if (part.indexOf(".") !== -1) {
          if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
          hextetCount += 2;
          continue;
        }
        if (!isHextet(part)) return void 0;
        parts[i] = parseInt(part, 16).toString(16);
        hextetCount++;
      }
      if (compression === -1) {
        if (hextetCount !== 8) return void 0;
        return compressIPv6ZeroRun(parts);
      }
      if (hextetCount >= 8) return void 0;
      const expanded = parts.slice(0, left.length);
      for (let i = hextetCount; i < 8; i++) expanded.push("0");
      for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
      return compressIPv6ZeroRun(expanded);
    }
    function normalizeIPv6(host) {
      const bracketed = host[0] === "[" && host[host.length - 1] === "]";
      const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
      if (hasBracket && !bracketed) return { host, isIPV6: false, error: true };
      let input = bracketed ? host.slice(1, -1) : host;
      if (bracketed && isIPvFuture(input)) {
        input = input.toLowerCase();
        return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
      }
      if (findToken(input, ":") < 2) {
        return { host, isIPV6: false, error: bracketed };
      }
      let zoneIdentifier = "";
      const zoneSeparator = input.indexOf("%");
      if (zoneSeparator !== -1) {
        const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
        zoneIdentifier = input.slice(zoneSeparator + separatorLength);
        if (!isZoneIdentifier(zoneIdentifier)) return { host, isIPV6: false, error: true };
        input = input.slice(0, zoneSeparator);
      }
      const address2 = normalizeIPv6Address(input);
      if (address2 === void 0) return { host, isIPV6: false, error: true };
      return {
        host: address2 + (zoneIdentifier ? "%" + zoneIdentifier : ""),
        escapedHost: address2 + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
        isIPV6: true
      };
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path) {
      let input = path;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function serializePathEncoding(input, pathNoScheme = false) {
      let output = "";
      let firstSegment = pathNoScheme && input[0] !== "/";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (ch === "/") {
          firstSegment = false;
        }
        if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeComponent(input, isAllowed) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (isAllowed(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeUserinfo(input) {
      return encodeComponent(input, isUserinfoCharacter);
    }
    function encodeQuery(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function encodeFragment(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function isEscapeSafe(cp) {
      return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
    }
    function normalizeQueryFragmentEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isQueryFragmentCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(encodeUserinfo(component.userinfo));
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = component.host;
        if (!isIPv4(host)) {
          let ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
            host = normalizePercentEncoding(host, true);
            ipV6res = normalizeIPv6(host);
          }
          if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        const port = String(component.port);
        if (!isPort(port)) {
          throw new TypeError("URI port is malformed.");
        }
        uriTokens.push(":");
        uriTokens.push(port);
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      serializePathEncoding,
      normalizeQueryFragmentEncoding,
      encodeUserinfo,
      encodeQuery,
      encodeFragment,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// ../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const queryIndex = wsComponent.resourceName.indexOf("?");
        const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
        wsComponent.path = path && path !== "/" ? path : void 0;
        wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches && matches[0] === urnComponent.path) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http3 = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https2 = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http3.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http: http3,
        https: https2,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// ../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "../../../node_modules/.pnpm/fast-uri@3.1.8/node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
    var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
    function decodeValidScheme(scheme) {
      const decodedScheme = unescape(String(scheme));
      if (!VALID_SCHEME.test(decodedScheme)) {
        throw new TypeError(MALFORMED_SCHEME_ERROR);
      }
      return decodedScheme;
    }
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const {
        parsed: baseParsed,
        malformedAuthorityOrPort: baseMalformed,
        malformedPercentEncoding: baseMalformedPercentEncoding,
        malformedSchemeSpecific: baseMalformedSchemeSpecific,
        malformedHost: baseMalformedHost,
        malformedScheme: baseMalformedScheme
      } = parseWithStatus(baseURI, schemelessOptions);
      const {
        parsed: relativeParsed,
        malformedAuthorityOrPort: relativeMalformed,
        malformedPercentEncoding: relativeMalformedPercentEncoding,
        malformedSchemeSpecific: relativeMalformedSchemeSpecific,
        malformedHost: relativeMalformedHost,
        malformedScheme: relativeMalformedScheme
      } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
      const resolvedHost = resolved.host;
      const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
      canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
      const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !new RegExp("\\P{ASCII}", "u").test(resolvedHost);
      if (resolved.error && !encodedASCIIHost) {
        throw new Error(resolved.error);
      }
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative = parse(serialize(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      if (component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
      }
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
      const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = serializePathEncoding(component.path, pathNoScheme);
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (pathNoScheme) {
          s = serializePathEncoding(s, true);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", encodeQuery(component.query));
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", encodeFragment(component.fragment));
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function hasMalformedPercentEncoding(component) {
      if (component === void 0) return false;
      let percent = component.indexOf("%");
      while (percent !== -1) {
        if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
          return true;
        }
        percent = component.indexOf("%", percent + 3);
      }
      return false;
    }
    function isIPLiteral(host) {
      return host[0] === "[" && host[host.length - 1] === "]";
    }
    function hasMalformedComponentPercentEncoding(matches) {
      const host = matches[4];
      return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
    }
    function canonicalizeHost(parsed, options, schemeHandler, isIP) {
      if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
        try {
          parsed.host = new URL("http://" + parsed.host).hostname;
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
          return true;
        }
      }
      return false;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let malformedPercentEncoding = false;
      let malformedSchemeSpecific = false;
      let malformedHost = false;
      let malformedIPLiteral = false;
      let malformedScheme = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (parsed.scheme !== void 0) {
          const decodedScheme = unescape(parsed.scheme);
          if (VALID_SCHEME.test(decodedScheme)) {
            parsed.scheme = decodedScheme.toLowerCase();
          } else {
            parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
            malformedScheme = true;
          }
        }
        malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
        if (malformedPercentEncoding) {
          parsed.error = parsed.error || "URI contains malformed percent-encoding.";
        }
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const bracketedIPLiteral = isIPLiteral(parsed.host);
            const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
            const ipv6result = normalizeIPv6(parsed.host);
            isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
            malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
            parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
            if (malformedIPLiteral) {
              parsed.error = parsed.error || "URI host is malformed.";
              malformedAuthorityOrPort = true;
            }
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!malformedIPLiteral) {
          malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
        }
        if (uri.indexOf("%") !== -1 && parsed.host !== void 0 && !malformedIPLiteral) {
          let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
          if (!isIP) {
            host = normalizePercentEncoding(host.toLowerCase());
          }
          parsed.host = reescapeHostDelimiters(host, isIP);
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.query) {
            parsed.query = normalizeQueryFragmentEncoding(parsed.query);
          }
          if (parsed.fragment) {
            parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
          if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) {
            malformedSchemeSpecific = true;
          }
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort,
        malformedPercentEncoding,
        malformedSchemeSpecific,
        malformedHost,
        malformedScheme
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri !== "string" && typeof uri !== "object") {
        return void 0;
      }
      let value;
      try {
        value = typeof uri === "string" ? uri : serialize(uri, opts);
      } catch {
        return void 0;
      }
      const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
      return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv2 = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = {};
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text2, msg) => text2 + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv2.ValidationError = validation_error_1.default;
    Ajv2.MissingRefError = ref_error_1.default;
    exports.default = Ajv2;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        const regExp = $data ? (0, codegen_1._)`(new RegExp(${schemaCode}, ${u}))` : (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv, sch) {
        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv2020 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv2020;
    module.exports = exports = Ajv2020;
    module.exports.Ajv2020 = Ajv2020;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv2020;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// ../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS({
  "../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/formats.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatNames = exports.fastFormats = exports.fullFormats = void 0;
    function fmtDef(validate, compare) {
      return { validate, compare };
    }
    exports.fullFormats = {
      // date: http://tools.ietf.org/html/rfc3339#section-5.6
      date: fmtDef(date, compareDate),
      // date-time: http://tools.ietf.org/html/rfc3339#section-5.6
      time: fmtDef(getTime(true), compareTime),
      "date-time": fmtDef(getDateTime(true), compareDateTime),
      "iso-time": fmtDef(getTime(), compareIsoTime),
      "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
      // duration: https://tools.ietf.org/html/rfc3339#appendix-A
      duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
      uri,
      "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
      // uri-template: https://tools.ietf.org/html/rfc6570
      "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
      // For the source: https://gist.github.com/dperini/729294
      // For test cases: https://mathiasbynens.be/demo/url-regex
      url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
      email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
      hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
      // optimized https://www.safaribooksonline.com/library/view/regular-expressions-cookbook/9780596802837/ch07s16.html
      ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
      ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
      regex,
      // uuid: http://tools.ietf.org/html/rfc4122
      uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      // JSON-pointer: https://tools.ietf.org/html/rfc6901
      // uri fragment: https://tools.ietf.org/html/rfc3986#appendix-A
      "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
      "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
      // relative JSON-pointer: http://tools.ietf.org/html/draft-luff-relative-json-pointer-00
      "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
      // the following formats are used by the openapi specification: https://spec.openapis.org/oas/v3.0.0#data-types
      // byte: https://github.com/miguelmota/is-base64
      byte,
      // signed 32 bit integer
      int32: { type: "number", validate: validateInt32 },
      // signed 64 bit integer
      int64: { type: "number", validate: validateInt64 },
      // C-type float
      float: { type: "number", validate: validateNumber },
      // C-type double
      double: { type: "number", validate: validateNumber },
      // hint to the UI to hide input strings
      password: true,
      // unchecked string payload
      binary: true
    };
    exports.fastFormats = {
      ...exports.fullFormats,
      date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
      time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
      "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
      "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
      "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
      // uri: https://github.com/mafintosh/is-my-json-valid/blob/master/formats.js
      uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
      "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
      // email (sources from jsen validator):
      // http://stackoverflow.com/questions/201323/using-a-regular-expression-to-validate-an-email-address#answer-8829363
      // http://www.w3.org/TR/html5/forms.html#valid-e-mail-address (search for 'wilful violation')
      email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
    };
    exports.formatNames = Object.keys(exports.fullFormats);
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
    var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    function date(str) {
      const matches = DATE.exec(str);
      if (!matches)
        return false;
      const year = +matches[1];
      const month = +matches[2];
      const day = +matches[3];
      return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
    }
    function compareDate(d1, d2) {
      if (!(d1 && d2))
        return void 0;
      if (d1 > d2)
        return 1;
      if (d1 < d2)
        return -1;
      return 0;
    }
    var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
    function getTime(strictTimeZone) {
      return function time(str) {
        const matches = TIME.exec(str);
        if (!matches)
          return false;
        const hr = +matches[1];
        const min = +matches[2];
        const sec = +matches[3];
        const tz = matches[4];
        const tzSign = matches[5] === "-" ? -1 : 1;
        const tzH = +(matches[6] || 0);
        const tzM = +(matches[7] || 0);
        if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
          return false;
        if (hr <= 23 && min <= 59 && sec < 60)
          return true;
        const utcMin = min - tzM * tzSign;
        const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
        return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
      };
    }
    function compareTime(s1, s2) {
      if (!(s1 && s2))
        return void 0;
      const t1 = (/* @__PURE__ */ new Date("2020-01-01T" + s1)).valueOf();
      const t2 = (/* @__PURE__ */ new Date("2020-01-01T" + s2)).valueOf();
      if (!(t1 && t2))
        return void 0;
      return t1 - t2;
    }
    function compareIsoTime(t1, t2) {
      if (!(t1 && t2))
        return void 0;
      const a1 = TIME.exec(t1);
      const a2 = TIME.exec(t2);
      if (!(a1 && a2))
        return void 0;
      t1 = a1[1] + a1[2] + a1[3];
      t2 = a2[1] + a2[2] + a2[3];
      if (t1 > t2)
        return 1;
      if (t1 < t2)
        return -1;
      return 0;
    }
    var DATE_TIME_SEPARATOR = /t|\s/i;
    function getDateTime(strictTimeZone) {
      const time = getTime(strictTimeZone);
      return function date_time(str) {
        const dateTime = str.split(DATE_TIME_SEPARATOR);
        return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
      };
    }
    function compareDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const d1 = new Date(dt1).valueOf();
      const d2 = new Date(dt2).valueOf();
      if (!(d1 && d2))
        return void 0;
      return d1 - d2;
    }
    function compareIsoDateTime(dt1, dt2) {
      if (!(dt1 && dt2))
        return void 0;
      const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
      const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
      const res = compareDate(d1, d2);
      if (res === void 0)
        return void 0;
      return res || compareTime(t1, t2);
    }
    var NOT_URI_FRAGMENT = /\/|:/;
    var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
    function uri(str) {
      return NOT_URI_FRAGMENT.test(str) && URI.test(str);
    }
    var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
    function byte(str) {
      BYTE.lastIndex = 0;
      return BYTE.test(str);
    }
    var MIN_INT32 = -(2 ** 31);
    var MAX_INT32 = 2 ** 31 - 1;
    function validateInt32(value) {
      return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
    }
    function validateInt64(value) {
      return Number.isInteger(value);
    }
    function validateNumber() {
      return true;
    }
    var Z_ANCHOR = /[^\\]\\Z/;
    function regex(str) {
      if (Z_ANCHOR.test(str))
        return false;
      try {
        new RegExp(str);
        return true;
      } catch (e) {
        return false;
      }
    }
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/vocabularies/draft7.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports.default = draft7Vocabularies;
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports, module) {
    module.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// ../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "../../../node_modules/.pnpm/ajv@8.17.1/node_modules/ajv/dist/ajv.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv2 = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv = Ajv2;
    module.exports = exports = Ajv2;
    module.exports.Ajv = Ajv2;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// ../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/limit.js
var require_limit = __commonJS({
  "../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/limit.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.formatLimitDefinition = void 0;
    var ajv_1 = require_ajv();
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    exports.formatLimitDefinition = {
      keyword: Object.keys(KWDs),
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, keyword, it } = cxt;
        const { opts, self } = it;
        if (!opts.validateFormats)
          return;
        const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
        if (fCxt.$data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
          cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
        }
        function validateFormat() {
          const format = fCxt.schema;
          const fmtDef = self.formats[format];
          if (!fmtDef || fmtDef === true)
            return;
          if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
            throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
          }
          const fmt = gen.scopeValue("formats", {
            key: format,
            ref: fmtDef,
            code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : void 0
          });
          cxt.fail$data(compareCode(fmt));
        }
        function compareCode(fmt) {
          return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
        }
      },
      dependencies: ["format"]
    };
    var formatLimitPlugin = (ajv) => {
      ajv.addKeyword(exports.formatLimitDefinition);
      return ajv;
    };
    exports.default = formatLimitPlugin;
  }
});

// ../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/index.js
var require_dist = __commonJS({
  "../../../node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.17.1/node_modules/ajv-formats/dist/index.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var formats_1 = require_formats();
    var limit_1 = require_limit();
    var codegen_1 = require_codegen();
    var fullName = new codegen_1.Name("fullFormats");
    var fastName = new codegen_1.Name("fastFormats");
    var formatsPlugin = (ajv, opts = { keywords: true }) => {
      if (Array.isArray(opts)) {
        addFormats2(ajv, opts, formats_1.fullFormats, fullName);
        return ajv;
      }
      const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
      const list = opts.formats || formats_1.formatNames;
      addFormats2(ajv, list, formats, exportName);
      if (opts.keywords)
        (0, limit_1.default)(ajv);
      return ajv;
    };
    formatsPlugin.get = (name, mode = "full") => {
      const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
      const f = formats[name];
      if (!f)
        throw new Error(`Unknown format "${name}"`);
      return f;
    };
    function addFormats2(ajv, list, fs, exportName) {
      var _a;
      var _b;
      (_a = (_b = ajv.opts.code).formats) !== null && _a !== void 0 ? _a : _b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`;
      for (const f of list)
        ajv.addFormat(f, fs[f]);
    }
    module.exports = exports = formatsPlugin;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatsPlugin;
  }
});

// src/extension.ts
import {
  CanvasError,
  createCanvas,
  joinSession
} from "@github/copilot-sdk/extension";
import { join as join6 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// ../../shared/runtime/state-directory.ts
import { homedir } from "node:os";
import { join } from "node:path";
function userStateDirectory(fallbackDirectory, {
  platform = process.platform,
  home = homedir(),
  localAppData = process.env.LOCALAPPDATA
} = {}) {
  return platform === "darwin" ? join(home, "Library", "Application Support") : localAppData ?? fallbackDirectory;
}

// ../../shared/runtime/office-request-metadata.ts
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

// ../../shared/runtime/local-http.ts
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

// ../../shared/auth/account-auth.ts
import { access, mkdir as mkdir2, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join as join3 } from "node:path";

// ../../shared/runtime/process-lock.ts
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, unlink } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// ../../shared/auth/auth-contract.ts
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

// ../../shared/auth/auth-product.ts
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

// ../../shared/runtime/process-lock.ts
async function coordinationPath(name) {
  if (process.platform === WINDOWS_PLATFORM) return `\\\\.\\pipe\\${name}`;
  if (process.platform !== MACOS_PLATFORM || !process.getuid) {
    throw new Error("Office runtime coordination requires Windows or macOS.");
  }
  const uid = process.getuid();
  const directory = join2(tmpdir(), `office-copilot-${uid}`);
  await mkdir(directory, { recursive: true, mode: 448 });
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.uid !== uid || (metadata.mode & 63) !== 0) {
    throw new Error("Office runtime coordination requires a private, user-owned socket directory.");
  }
  const path = join2(directory, createHash("sha256").update(name).digest("hex").slice(0, 24));
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
        const release = await lockfile.lock(join2(directory, `.${lockName}`), {
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

// ../../shared/auth/account-auth.ts
var exists = (path) => access(path).then(() => true, () => false);
function createAccountAuth({
  provider,
  selectionPath,
  legacySelectionPath,
  now = Date.now,
  product = GENERIC_AUTH_PRODUCT,
  lock = createDirectoryLock(dirname(selectionPath), "account selection", { product })
}) {
  const importMarkerPath = join3(dirname(selectionPath), "legacy-import.json");
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

// src/runtime/local-mcp-client.ts
import http from "node:http";
import { randomUUID as randomUUID2 } from "node:crypto";
var MCP_PROTOCOL_VERSION = "2025-11-25";
var LocalMcpHttpError = class extends Error {
  statusCode;
  constructor(statusCode, body) {
    super(`Local Excel MCP returned HTTP ${statusCode}: ${body}`);
    this.name = "LocalMcpHttpError";
    this.statusCode = statusCode;
  }
};
var LocalMcpTimeoutError = class extends Error {
  constructor(timeoutMs) {
    super(`Local Excel MCP timed out after ${timeoutMs} ms`);
    this.name = "LocalMcpTimeoutError";
  }
};
function parseRpcMessages(contentType, body) {
  const text2 = body.toString("utf8").trim();
  if (!text2) {
    return [];
  }
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    const parsed = JSON.parse(text2);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return text2.split(/\r?\n\r?\n/).flatMap((event) => event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5).trim())));
}
function postRpc(url, message, timeoutMs, sessionId, onMessage, signal, clientToken) {
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new TypeError("Local Excel MCP must use a 127.0.0.1 HTTP endpoint.");
  }
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(message));
    const request = http.request(url, {
      method: "POST",
      signal,
      headers: {
        ...clientToken ? { [LOCAL_CAPABILITY_HEADER]: clientToken } : {},
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "content-length": String(body.length),
        ...sessionId ? { "mcp-session-id": sessionId } : {}
      }
    }, (response) => {
      response.once("error", reject);
      void (async () => {
        if (response.statusCode === void 0 || response.statusCode < 200 || response.statusCode >= 300) {
          const chunks = [];
          for await (const chunk of response) {
            chunks.push(Buffer.from(chunk));
          }
          throw new LocalMcpHttpError(
            response.statusCode,
            Buffer.concat(chunks).toString("utf8")
          );
        }
        const messages = await readMessages(response, onMessage);
        resolve({
          messages,
          sessionId: Array.isArray(response.headers["mcp-session-id"]) ? response.headers["mcp-session-id"][0] : response.headers["mcp-session-id"]
        });
      })().catch((error) => {
        request.destroy();
        reject(error);
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new LocalMcpTimeoutError(timeoutMs));
    });
    request.once("error", reject);
    request.end(body);
  });
}
async function readMessages(response, onMessage) {
  const type = String(response.headers["content-type"] ?? "");
  if (!type.includes("text/event-stream")) {
    const chunks = [];
    for await (const chunk of response) {
      chunks.push(Buffer.from(chunk));
    }
    const messages2 = parseRpcMessages(type, Buffer.concat(chunks));
    for (const message of messages2) {
      await onMessage?.(message);
    }
    return messages2;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const messages = [];
  const consume = async (event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") {
      return;
    }
    const message = JSON.parse(data);
    messages.push(message);
    await onMessage?.(message);
  };
  for await (const chunk of response) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      await consume(event);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    await consume(buffer);
  }
  return messages;
}
function responseForId(messages, id) {
  const message = messages.find((candidate) => candidate?.id === id);
  if (!message) {
    throw new Error("Local Excel MCP returned no response for the request.");
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
  flights,
  xMetadata,
  onElicitation,
  onProgress,
  signal,
  clientToken
}) {
  const url = new URL(path, origin);
  const requestMeta = flights ? { flights } : void 0;
  const initializeId = `initialize-${randomUUID2()}`;
  const initialized = await postRpc(url, {
    jsonrpc: "2.0",
    id: initializeId,
    method: "initialize",
    params: {
      ...requestMeta ? { _meta: requestMeta } : {},
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: onElicitation ? { elicitation: { form: {} } } : {},
      clientInfo: {
        name: "excel-agent-extension",
        version: "1.0.0"
      }
    }
  }, timeoutMs, void 0, void 0, signal, clientToken);
  responseForId(initialized.messages, initializeId);
  if (!initialized.sessionId) {
    throw new Error("Local Excel MCP did not establish a session.");
  }
  await postRpc(url, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    ...requestMeta ? { params: { _meta: requestMeta } } : {}
  }, timeoutMs, initialized.sessionId, void 0, signal, clientToken);
  const callId = `call-${randomUUID2()}`;
  const progressToken = onProgress ? `progress-${randomUUID2()}` : void 0;
  const called = await postRpc(url, {
    jsonrpc: "2.0",
    id: callId,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      ...requestMeta || progressToken || xMetadata ? {
        _meta: {
          ...requestMeta,
          ...xMetadata ? { xMetadata } : {},
          ...progressToken ? { progressToken } : {}
        }
      } : {}
    }
  }, timeoutMs, initialized.sessionId, async (message) => {
    if (message?.method === "notifications/progress" && message.params?.progressToken === progressToken) {
      const text2 = message.params?.message;
      if (typeof text2 === "string" && text2.trim()) {
        try {
          onProgress?.(text2);
        } catch {
        }
      }
      return;
    }
    if (!message?.method || message.id === void 0) {
      return;
    }
    let result;
    if (message.method === "ping") {
      result = {};
    } else if (message.method === "elicitation/create" && onElicitation) {
      result = await onElicitation(message.params);
    } else {
      throw new Error(`Unsupported Excel MCP server request: ${message.method}`);
    }
    signal?.throwIfAborted();
    await postRpc(
      url,
      { jsonrpc: "2.0", id: message.id, result },
      timeoutMs,
      initialized.sessionId,
      void 0,
      signal,
      clientToken
    );
  }, signal, clientToken);
  return responseForId(called.messages, callId);
}

// ../shared/auth/auth-product.ts
var EXCEL_AUTH_PRODUCT = {
  name: "Excel",
  workerPathEnvVar: "EXCEL_AUTH_WORKER_PATH",
  windowExecutable: "ExcelAuthWindow.exe",
  lockPrefix: "excel",
  architectures: NATIVE_ARCHITECTURES,
  additionalScopes: [WAC_SCOPE],
  macOS: SHARED_WXP_MACOS
};

// ../../shared/auth/native-auth.ts
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

// src/runtime/office-task-proxy.ts
import http2 from "node:http";
import https from "node:https";
import { randomUUID as randomUUID4 } from "node:crypto";
import { Readable } from "node:stream";

// src/runtime/primus-viewer.ts
import { existsSync } from "node:fs";
import { dirname as dirname2, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// src/runtime/excel-url.ts
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
function isTrustedExcelHost(hostname) {
  const normalized = String(hostname ?? "").toLowerCase();
  return trustedExactHosts.has(normalized) || trustedHostPatterns.some((pattern) => pattern.test(normalized));
}
function workbookTitleFromUrl(artifactUrl) {
  const url = new URL(artifactUrl);
  const fileName = url.searchParams.get("file");
  if (fileName?.trim()) {
    return fileName.trim();
  }
  return decodeURIComponent(url.pathname.split("/").pop() || "") || "Excel workbook";
}

// ../../shared/viewer/viewer-host.ts
import { readFile as readFile2 } from "node:fs/promises";
import { join as join4 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

// ../../shared/auth/http-auth.ts
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
    const text2 = value.trim();
    return text2.startsWith("{") ? text2 : decodeAuthenticationClaims(text2);
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

// ../../shared/auth/renewable-office-fetch.ts
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

// ../../shared/runtime/viewer-sessions.ts
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

// ../../shared/viewer/viewer-host.ts
var GRAPH_SCOPE2 = "https://graph.microsoft.com/.default";
var GRAPH_HOSTS = /* @__PURE__ */ new Set([
  "graph.microsoft.com",
  "graph.microsoft.us",
  "dod-graph.microsoft.us",
  "graph.microsoft.de",
  "microsoftgraph.chinacloudapi.cn"
]);
var OFFICE_HOST_SUFFIXES = [
  ".officeapps.live.com",
  ".office.com",
  ".onedrive.com"
];
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
          const asset = await readFile2(join4(
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
        response.end(await readFile2(join4(viewerDirectory2, "index.html")));
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

// src/runtime/primus-viewer.ts
var currentDirectory = dirname2(fileURLToPath(import.meta.url));
var adjacentViewerDirectory = join5(currentDirectory, "viewer");
var viewerDirectory = existsSync(adjacentViewerDirectory) ? adjacentViewerDirectory : join5(currentDirectory, "..", "viewer");
var CAPABILITIES = {
  selection: true,
  artifactRoute: true
};
function createPrimusViewerHost({
  fetchImpl = fetch,
  resourceTokenProvider = async (_scope, _options) => {
    throw new AuthError("not_connected", "Connect your Excel account before accessing workbooks.");
  },
  authStatus: authStatus2 = void 0,
  onUnauthorized = void 0,
  onSelection = void 0,
  onClose = void 0
} = {}) {
  return createViewerHost({
    product: {
      authProduct: EXCEL_AUTH_PRODUCT,
      noun: "workbook",
      isTrustedHost: isTrustedExcelHost,
      officeHostSuffixes: OFFICE_HOST_SUFFIXES,
      supportsWac: true
    },
    viewerDirectory,
    capabilities: CAPABILITIES,
    fetchImpl,
    getToken: resourceTokenProvider,
    authStatus: authStatus2,
    onUnauthorized,
    onSelection,
    onClose
  });
}

// src/runtime/office-endpoint.ts
var DEFAULT_OFFICE_MCP_URL = "https://dogfood.augloop.svc.cloud.microsoft/mcp/office-agent-mcp";
var LOCAL_OFFICE_MCP_URL = "http://localhost:11040/mcp/office-agent-mcp";
var LOCAL_OFFICEPY_FLIGHT = "Microsoft.Office.Augloop.OfficeAgent.OfficePyLocalhost:true";
function resolveOfficeMcpFlights(officeMcpUrl, useLocalOfficeAgent) {
  if (useLocalOfficeAgent === void 0 || useLocalOfficeAgent.toLowerCase() === "false") {
    return void 0;
  }
  if (useLocalOfficeAgent.toLowerCase() !== "true") {
    throw new Error("EXCEL_AGENT_USE_LOCAL_OFFICEAGENT must be true or false, or unset.");
  }
  if (officeMcpUrl !== LOCAL_OFFICE_MCP_URL) {
    throw new Error("EXCEL_AGENT_USE_LOCAL_OFFICEAGENT=true requires EXCEL_AGENT_USE_LOCAL_AL=true.");
  }
  return LOCAL_OFFICEPY_FLIGHT;
}
function resolveOfficeMcpUrl(useLocalAl) {
  if (useLocalAl === void 0 || useLocalAl.toLowerCase() === "false") {
    return DEFAULT_OFFICE_MCP_URL;
  }
  if (useLocalAl.toLowerCase() === "true") {
    return LOCAL_OFFICE_MCP_URL;
  }
  throw new Error("EXCEL_AGENT_USE_LOCAL_AL must be true or false, or unset to use dogfood.");
}

// src/runtime/type-guards.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/runtime/excel-task.ts
var EXCEL_TASK_NAMES = {
  generate: "generate_artifact",
  edit: "edit_artifact"
};
var UntrustedWorkbookLinkError = class extends Error {
  constructor() {
    super("Excel returned a workbook link without a trusted HTTPS URL.");
    this.name = "UntrustedWorkbookLinkError";
  }
};
function workbookFromResourceLink(content) {
  for (const item of Array.isArray(content) ? content : []) {
    if (!isRecord(item) || item.type !== "resource_link") {
      continue;
    }
    if (typeof item.uri !== "string") {
      throw new UntrustedWorkbookLinkError();
    }
    let url;
    try {
      url = new URL(item.uri);
    } catch {
      throw new UntrustedWorkbookLinkError();
    }
    if (url.protocol !== "https:" || !isTrustedExcelHost(url.hostname) || url.username || url.password) {
      throw new UntrustedWorkbookLinkError();
    }
    return {
      artifactUrl: item.uri,
      title: typeof item.name === "string" && item.name.trim() ? item.name.trim() : workbookTitleFromUrl(url.href)
    };
  }
  return void 0;
}
function prepareWorkbookResult(name, result) {
  if (!isRecord(result)) {
    return result;
  }
  if (name !== EXCEL_TASK_NAMES.generate && name !== EXCEL_TASK_NAMES.edit) {
    throw new Error(`Unsupported Excel operation: ${name}`);
  }
  if (name === EXCEL_TASK_NAMES.edit) {
    return result;
  }
  const structured = isRecord(result.structuredContent) ? result.structuredContent : {};
  const hadDerivedFields = "excelWorkbook" in structured || "excelAgentResponse" in structured;
  const { excelWorkbook: _previousWorkbook, excelAgentResponse: _previousResponse, ...metadata } = structured;
  const workbook = result.isError === true ? void 0 : workbookFromResourceLink(result.content);
  if (!workbook && !hadDerivedFields) {
    return result;
  }
  return {
    ...result,
    structuredContent: {
      ...metadata,
      ...workbook ? { excelWorkbook: workbook } : {}
    }
  };
}

// src/runtime/office-task-proxy.ts
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 0;
var DEFAULT_UPSTREAM_URL = DEFAULT_OFFICE_MCP_URL;
var OFFICE_CLIENT_METADATA = JSON.stringify({
  appName: "ghcp",
  appPlatform: "Client"
});
var MCP_PROTOCOL_VERSION2 = "2025-11-25";
var MAX_REQUEST_BYTES = 20 * 1024 * 1024;
var OAUTH_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
var TASK_TTL_MS = 60 * 60 * 1e3;
var TASK_TIMEOUT_MS = 30 * 60 * 1e3;
var DEFAULT_TASK_POLL_MS = 5e3;
var MIN_TASK_POLL_MS = 2e3;
var MAX_TASK_POLL_MS = 15e3;
var DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1e3;
var EXCEL_MCP_SERVER_NAME = "excel-agent-mcp";
var EXCEL_TASK_TOOLS = new Set(Object.values(EXCEL_TASK_NAMES));
var UI_MCP_KEEPALIVE_MS = 15e3;
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
  if (message?.method !== "tools/call" || !EXCEL_TASK_TOOLS.has(message.params?.name) || !metadata || !Array.isArray(metadata.conversation)) {
    return message;
  }
  message.params._meta = {
    ...message.params._meta,
    conversationId: metadata.conversationId,
    conversation: metadata.conversation,
    conversationSchemaVersion: "2"
  };
  return message;
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
          name: EXCEL_MCP_SERVER_NAME
        }
      }
    };
  }
  return responseMessage;
}
function ensureSseEventTerminator(responseBody) {
  const text2 = responseBody.toString("utf8");
  if (!/(?:^|\r?\n)(?:event|data):/.test(text2)) {
    return responseBody;
  }
  const normalized = text2.replace(/\r\n/g, "\n");
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
  const text2 = responseBody.toString("utf8");
  try {
    const parsed = JSON.parse(text2);
    return Buffer.from(JSON.stringify(
      transformRpcResponseMessage(requestMessage, parsed)
    ));
  } catch {
    let changed = false;
    const transformed = text2.replace(
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
  const error = {
    jsonrpc: "2.0",
    id: requestId,
    error: { code: -32e3, message }
  };
  if (response.destroyed || response.writableEnded) {
    console.error("[excel-agent] Cannot send an MCP error after the response closed:", message);
    return;
  }
  if (response.headersSent) {
    if (String(response.getHeader("content-type")).startsWith("text/event-stream")) {
      writeSseMessage(response, error);
      response.end();
    } else {
      console.error("[excel-agent] Cannot replace a partially sent MCP response:", message);
      response.destroy(new Error(message));
    }
    return;
  }
  response.statusCode = 200;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(error));
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
async function handleExcelUiMcpRequest({
  request,
  response,
  requestUrl,
  workbookTools: workbookTools2 = []
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
        tools: {}
      },
      serverInfo: {
        name: "excel-agent-ui-mcp",
        title: "Excel",
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
      tools: workbookTools2.map(({ name, title, description, inputSchema }) => ({
        name,
        title,
        description,
        inputSchema
      }))
    });
    return true;
  }
  if (message.method === "tools/call" && workbookTools2.some((tool) => tool.name === message.params?.name)) {
    const tool = workbookTools2.find((entry) => entry.name === message.params.name);
    const progressToken = message.params?._meta?.progressToken;
    let progress = 0;
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.flushHeaders();
    const onProgress = (text2) => {
      if (typeof text2 !== "string" || !text2 || response.destroyed || response.writableEnded) {
        return;
      }
      writeTaskProgress(response, progressToken, ++progress, progressHeadline(text2));
    };
    const keepalive = setInterval(() => {
      if (response.destroyed || response.writableEnded) {
        return;
      }
      response.write(": keepalive\n\n");
    }, UI_MCP_KEEPALIVE_MS);
    keepalive.unref?.();
    try {
      const result = await tool.handler(message.params.arguments ?? {}, { onProgress });
      if (!response.destroyed && !response.writableEnded) {
        writeSseMessage(response, {
          jsonrpc: "2.0",
          id: message.id,
          result
        });
      }
    } catch (error) {
      writeRpcError(
        response,
        message.id,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearInterval(keepalive);
      if (!response.destroyed && !response.writableEnded) {
        response.end();
      }
    }
    return true;
  }
  writeRpcError(response, message.id, `Method not found: ${message.method}`);
  return true;
}
function parseRpcMessages2(body) {
  const text2 = body.toString("utf8");
  try {
    const parsed = JSON.parse(text2);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text2.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice("data:".length).trim()));
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
var HEADLINE_SEPARATORS = /[:\uFF1A\uFE55\u0589\u1361\u05C3\u2236]+$/;
function progressHeadline(text2) {
  const [first] = String(text2).split("\n");
  const headline = first.trim().replace(HEADLINE_SEPARATORS, "").trim();
  return headline.length > 0 ? headline : String(text2).trim();
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
  onServerRequest = void 0,
  signal = void 0
}) {
  const id = `excel-proxy-${randomUUID4()}`;
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
      redirect: "manual",
      signal
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
  pendingServerRequests
}) {
  const requestId = message.id;
  const requestKey = JSON.stringify([initialSessionId, requestId]);
  const progressToken = message.params?._meta?.progressToken;
  let sessionId = initialSessionId;
  let taskId;
  let completed = false;
  let clientClosed = false;
  let deliveredResult = false;
  const controller = new AbortController();
  const clearServerRequests = () => {
    for (const [id, pending] of pendingServerRequests) {
      if (pending.ownerRequestKey === requestKey) {
        pendingServerRequests.delete(id);
        pending.reject(new Error("Managed Office task ended before elicitation completed"));
      }
    }
  };
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
      sessionId,
      signal: AbortSignal.timeout(1e4)
    }).catch(() => {
      console.error("[excel-agent] Office task cancellation failed.");
    });
  };
  response.once("close", () => {
    if (!completed) {
      clientClosed = true;
      clearServerRequests();
      controller.abort(new Error("Excel client disconnected."));
    }
  });
  const forwardedMeta = message.params._meta ? { ...message.params._meta } : void 0;
  if (forwardedMeta) {
    delete forwardedMeta.progressToken;
  }
  const taskParams = {
    name: message.params.name,
    arguments: message.params.arguments,
    task: { ttl: TASK_TTL_MS },
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
      sessionId,
      signal: controller.signal
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
      result: created.message?.result
    };
    response.statusCode = 200;
    copyResponseHeaders(created.upstreamResponse, response, localOrigin);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(correlated));
    return;
  }
  taskId = task.taskId;
  if (clientClosed) {
    await cancelTask();
    return;
  }
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
  let startedAt = Date.now();
  let lastProgressMessage;
  const emitProgress = (message2) => {
    const headline = progressHeadline(message2);
    if (!headline || headline === lastProgressMessage) {
      response.write(": keepalive\n\n");
      return;
    }
    lastProgressMessage = headline;
    writeTaskProgress(response, progressToken, ++progress, headline);
  };
  try {
    if (statusMessage) {
      emitProgress(statusMessage);
    }
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
          sessionId,
          signal: controller.signal
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
        emitProgress(statusMessage ?? "Working...");
      }
      const result = await upstreamRpc({
        upstream,
        baseHeaders,
        fetchImpl,
        method: "tasks/result",
        params: { taskId },
        sessionId,
        signal: controller.signal,
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
              redirect: "manual",
              signal: controller.signal
            });
            return [];
          }
          const continuationMessages = await new Promise((resolve, reject) => {
            if (controller.signal.aborted) {
              reject(controller.signal.reason);
              return;
            }
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
              ownerRequestId: requestId,
              signal: controller.signal,
              resolve,
              reject
            });
            writeSseMessage(response, serverRequest);
          });
          return continuationMessages;
        }
      });
      sessionId = result.sessionId;
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
        startedAt = Date.now();
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
        emitProgress(statusMessage ?? "Continuing...");
        continue;
      }
      writeSseMessage(response, {
        jsonrpc: "2.0",
        id: requestId,
        result: result.message.result
      });
      deliveredResult = true;
      completed = true;
      response.end();
      return;
    }
  } catch (error) {
    await cancelTask();
    if (!clientClosed) {
      writeRpcError(response, requestId, error instanceof Error ? error.message : String(error));
    }
  } finally {
    activeManagedTasks.delete(requestKey);
    clearServerRequests();
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
        console.error("[excel-agent] Office MCP task capabilities:", JSON.stringify(
          upstreamResponse?.result?.capabilities?.tasks ?? null
        ));
      } else if (request?.method === "tools/list") {
        const tools = upstreamResponse?.result?.tools;
        const taskSupport = Array.isArray(tools) ? Object.fromEntries(tools.map((tool) => [
          tool?.name,
          tool?.execution?.taskSupport ?? null
        ])) : {};
        console.error("[excel-agent] Office MCP tool task support:", JSON.stringify(taskSupport));
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
  primusViewerHost: primusViewerHost2 = createPrimusViewerHost({ fetchImpl }),
  conversationProvider = void 0,
  authorizeFetch = void 0,
  workbookTools: workbookTools2 = []
} = {}) {
  assertLoopbackBind(host);
  const clientToken = createLocalCapability();
  const upstream = new URL(upstreamUrl);
  const baseTaskFetchImpl = fetchImpl === fetch ? createOfficeTaskFetch(Math.max(TASK_TIMEOUT_MS, taskTimeoutMs)) : fetchImpl;
  const upstreamFetchImpl = authorizeFetch ? authorizeFetch(fetchImpl) : fetchImpl;
  const taskFetchImpl = authorizeFetch ? authorizeFetch(baseTaskFetchImpl) : baseTaskFetchImpl;
  const activeManagedTasks = /* @__PURE__ */ new Map();
  const pendingServerRequests = /* @__PURE__ */ new Map();
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
    if (await primusViewerHost2.handleRequest(request, response, requestUrl)) {
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      response.statusCode = 204;
      response.setHeader("x-excel-agent-proxy", "1");
      response.end();
      return;
    }
    try {
      if (await handleExcelUiMcpRequest({
        request,
        response,
        requestUrl,
        workbookTools: workbookTools2
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
    let excelRequestId;
    try {
      const rawBody = await readRequestBody(request);
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
      const isExcelToolCall = request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && EXCEL_TASK_TOOLS.has(parsedMessage?.params?.name);
      if (isExcelToolCall) {
        excelRequestId = parsedMessage.id;
        if (conversationProvider) {
          addConversationMetadata(
            parsedMessage,
            await conversationProvider()
          );
        }
        body = Buffer.from(JSON.stringify(parsedMessage));
      }
      const headers = forwardedRequestHeaders(request.headers, body.length);
      headers.set("x-client-metadata", OFFICE_CLIENT_METADATA);
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
          const upstreamResponse2 = await taskFetchImpl(pending.upstream, {
            method: "POST",
            headers: responseHeaders,
            body,
            redirect: "manual",
            signal: pending.signal
          });
          if (!upstreamResponse2.ok) {
            throw new Error(`Office elicitation response returned HTTP ${upstreamResponse2.status}`);
          }
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
      if (request.method === "POST" && !Array.isArray(parsedMessage) && parsedMessage?.method === "tools/call" && EXCEL_TASK_TOOLS.has(parsedMessage?.params?.name) && parsedMessage.id !== void 0) {
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
          pendingServerRequests
        });
        return;
      }
      const upstreamResponse = await upstreamFetchImpl(upstream, {
        method: request.method,
        headers,
        body,
        redirect: "manual"
      });
      response.statusCode = upstreamResponse.status;
      copyResponseHeaders(upstreamResponse, response, requestUrl.origin);
      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
      logTaskNegotiation(body, responseBody);
      response.end(transformRpcResponseBody(body, responseBody));
    } catch (error) {
      if (excelRequestId !== void 0) {
        writeRpcError(response, excelRequestId, error instanceof Error ? error.message : String(error));
        return;
      }
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
      const hasViewerLease = primusViewerHost2.hasActiveSessions?.() === true;
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
    createExcelViewerUrl(artifactUrl, title, mode = "view", instanceId = void 0) {
      return primusViewerHost2.createViewerUrl(
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
    primusViewerHost2.resetAuthSessions?.();
  });
  scheduleIdleShutdown();
  return proxyServer2;
}
var officeTaskProxyDefaults = Object.freeze({
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  upstreamUrl: DEFAULT_UPSTREAM_URL,
  protocolVersion: MCP_PROTOCOL_VERSION2,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
  maxRequestBytes: MAX_REQUEST_BYTES
});

// src/runtime/session-conversation.ts
import { randomUUID as randomUUID5 } from "node:crypto";

// ../../shared/runtime/conversation-handoff.ts
var MAX_USER_TURNS = 20;
var MAX_MESSAGE_BYTES = 256 * 1024;
var MAX_CONVERSATION_BYTES = 512 * 1024;
var MAX_INVOCATION_BYTES = 64 * 1024;
function truncateUtf8(value, maximumBytes, truncationMarker) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") <= maximumBytes) {
    return value;
  }
  const contentBudget = maximumBytes - Buffer.byteLength(truncationMarker, "utf8");
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
  return `${value.slice(0, low)}${truncationMarker}`;
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
function createOfficeConversationMapper(pluginName) {
  const truncationMarker = `
[truncated by ${pluginName} plugin conversation handoff]`;
  return function toOfficeConversation2(events) {
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
          text: truncateUtf8(event.data.content, MAX_MESSAGE_BYTES, truncationMarker),
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
          text: truncateUtf8(event.data.content, MAX_MESSAGE_BYTES, truncationMarker),
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
          MAX_MESSAGE_BYTES,
          truncationMarker
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
  };
}

// src/runtime/session-conversation.ts
var toOfficeConversation = createOfficeConversationMapper("Excel");
function createOfficeConversationIdProvider(useLocalContainer) {
  const localId = useLocalContainer ? randomUUID5() : void 0;
  return (sessionId) => localId ?? sessionId;
}

// src/runtime/workbook-upload.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { readFile as readFile3, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
var UPLOAD_TOOL = "upload_artifact";
var GHCP_UPLOAD_FLIGHT = "OfficeAgent.useMCPExperiment7:true";
var MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
var ZIP_SIGNATURE = Buffer.from([80, 75, 3, 4]);
var untrusted = "Excel returned a workbook link without a trusted HTTPS URL.";
var UploadError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UploadError";
  }
};
function targetName(path) {
  const name = basename(path);
  const stem = name.slice(0, -extname(name).length);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:.]/g, "");
  const suffix = `-${stamp}-${randomUUID6()}.xlsx`;
  return `Copilot-${stem.slice(0, Math.max(1, 255 - "Copilot-".length - suffix.length))}${suffix}`;
}
function tooLarge() {
  return new UploadError(
    `The workbook must be a .xlsx file no larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`
  );
}
var unreadable = "The workbook must be a readable .xlsx file.";
async function readLocally(read) {
  try {
    return await read();
  } catch (cause) {
    throw new UploadError(unreadable, { cause });
  }
}
async function measureWorkbook(path) {
  if (extname(path).toLowerCase() !== ".xlsx") {
    throw new UploadError("Only .xlsx workbooks can be uploaded.");
  }
  const details = await readLocally(() => stat(path));
  if (!details.isFile() || details.size < ZIP_SIGNATURE.length) {
    throw new UploadError(unreadable);
  }
  return details.size;
}
function resultText(result) {
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (isRecord(item) && item.type === "text" && typeof item.text === "string" && item.text.trim()) {
      return item.text.trim();
    }
  }
  return void 0;
}
function uploadedArtifact(result, failure) {
  if (!isRecord(result)) {
    throw new UploadError(failure);
  }
  if (result.isError === true) {
    throw new UploadError(resultText(result) ?? failure);
  }
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (!isRecord(item) || item.type !== "resource_link" || typeof item.uri !== "string") {
      continue;
    }
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : void 0;
    if (!name) {
      continue;
    }
    let url;
    try {
      url = new URL(item.uri);
    } catch {
      throw new UploadError(untrusted);
    }
    if (url.protocol !== "https:" || !isTrustedExcelHost(url.hostname) || url.username || url.password) {
      throw new UploadError(untrusted);
    }
    return { name, webUrl: item.uri };
  }
  throw new UploadError(failure);
}
function createWorkbookUploader({
  callUploadTool
}) {
  const reportOversize = (fileName, totalBytes) => {
    void callUploadTool(UPLOAD_TOOL, { artifact: { fileName, totalBytes } }, randomUUID6()).catch(() => void 0);
  };
  return async function uploadWorkbook2(path) {
    if (typeof path !== "string" || !path.trim()) {
      throw new UploadError("A local .xlsx path is required.");
    }
    const resolvedPath = path.trim();
    const fileName = targetName(resolvedPath);
    const declaredBytes = await measureWorkbook(resolvedPath);
    if (declaredBytes > MAX_UPLOAD_BYTES) {
      reportOversize(fileName, declaredBytes);
      throw tooLarge();
    }
    const content = await readLocally(() => readFile3(resolvedPath));
    if (content.length > MAX_UPLOAD_BYTES) {
      reportOversize(fileName, content.length);
      throw tooLarge();
    }
    if (!content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
      throw new UploadError("Only ZIP-based, unencrypted .xlsx workbooks can be uploaded.");
    }
    const requestId = randomUUID6();
    return uploadedArtifact(
      await callUploadTool(UPLOAD_TOOL, {
        artifact: { fileName, contentBase64: content.toString("base64") }
      }, requestId),
      `The upload of '${fileName}' could not be confirmed. Check your OneDrive before retrying; the upload was not replayed. (Upload reference: ${requestId})`
    );
  };
}
var PREVIEW_TIMEOUT_MS = 1e4;
function createUploadWithPreview(uploadWorkbook2, openPreview, previewTimeoutMs = PREVIEW_TIMEOUT_MS) {
  return async (path) => {
    const uploaded = await uploadWorkbook2(path);
    const message = "A copy was uploaded to your OneDrive; your local file was not changed.";
    try {
      await withTimeout(openPreview(uploaded), previewTimeoutMs);
      return { ...uploaded, preview: "opened", message };
    } catch (error) {
      console.error("[excel-agent] Could not open the uploaded workbook preview:", error);
      return {
        ...uploaded,
        preview: "unavailable",
        message: `${message}
The upload succeeded, but the preview could not be opened.`
      };
    }
  };
}
async function withTimeout(work, ms) {
  let timer;
  const expired = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Preview did not open within ${ms}ms.`)), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
    void work.catch(() => void 0);
  }
}

// src/runtime/workbook-execution/user-facing-error.ts
var WorkbookInputStoppedError = class extends Error {
  reason;
  constructor(reason) {
    super(reason === "expired" ? "Excel approval expired." : "Excel operation cancelled by the user.");
    this.name = "WorkbookInputStoppedError";
    this.reason = reason;
  }
};
var WorkbookOperationBusyError = class extends Error {
  constructor() {
    super("An Excel operation is already running or waiting for input. Wait for it to finish; if cancelled, close its remaining dialog before starting another operation.");
    this.name = "WorkbookOperationBusyError";
  }
};
function userFacingWorkbookError(error) {
  if (error instanceof UploadError) {
    return new Error(error.message);
  }
  if (error instanceof WorkbookOperationBusyError) {
    return new WorkbookOperationBusyError();
  }
  if (error instanceof WorkbookInputStoppedError) {
    return new Error(error.reason === "expired" ? "The workbook input request expired. The operation was stopped and was not retried. Close any remaining input dialog. Changes already made are not rolled back." : "The workbook operation was cancelled and was not retried. Changes already made are not rolled back.");
  }
  if (error instanceof LocalMcpHttpError) {
    if (error.statusCode === 401) {
      return new Error("Your Microsoft 365 sign-in needs attention. Reconnect your account, then check whether the workbook request completed before trying again.");
    }
    if (error.statusCode === 403) {
      return new Error("Access to the workbook service or file was denied. I cannot confirm whether the requested change was made.");
    }
    if (error.statusCode === 429 || error.statusCode !== void 0 && error.statusCode >= 500) {
      return new Error("The workbook service could not return a confirmed result. It may have changed a file, so I did not retry automatically.");
    }
  }
  if (error instanceof LocalMcpTimeoutError) {
    return new Error("The workbook request timed out. I cannot confirm whether it completed, so I did not retry automatically.");
  }
  if (error instanceof UntrustedWorkbookLinkError) {
    return new Error("The returned workbook link could not be opened safely. I cannot confirm a usable new workbook for this request.");
  }
  return new Error("I could not confirm whether the workbook request completed. I did not retry it automatically.");
}
async function presentWorkbookResult(result) {
  try {
    return await result;
  } catch (error) {
    console.error("[excel-agent] Workbook operation failed:", error);
    return {
      isError: true,
      content: [{ type: "text", text: userFacingWorkbookError(error).message }]
    };
  }
}

// src/runtime/workbook-execution/elicitation/source-markdown.ts
var UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
var UNSAFE_URL_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/;
function displayText(value) {
  return value.replace(UNSAFE_TEXT, " ");
}
function sourceUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || UNSAFE_URL_TEXT.test(value)) {
    return void 0;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : void 0;
  } catch {
    return void 0;
  }
}
function markdownText(value) {
  return displayText(value).replace(/[\\`*_{}()<>!#|~&]/g, "\\$&").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
}
function formatSourceMarkdownItems(sources, ordered = true) {
  return sources.map((source, index) => {
    const label = markdownText(source.fileName ?? source.title);
    const url = sourceUrl(source.url);
    const destination = url?.replace(/&/g, "&amp;");
    const prefix = ordered ? `${index + 1}.` : "-";
    return `${prefix} ${url ? `[${label}](<${destination}>)` : label}`;
  }).join("\n");
}

// src/runtime/workbook-execution/elicitation/source-approval.ts
var SOURCE_APPROVAL_METADATA_KEY = "office-agent/sdl";
var SOURCE_APPROVAL_INTERACTION_TYPE = "excel-entity-permissions";
function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readSdl(request) {
  const raw = request._meta?.[SOURCE_APPROVAL_METADATA_KEY];
  let sdl = raw;
  if (typeof raw === "string") {
    try {
      sdl = JSON.parse(raw);
    } catch {
      throw new Error("Excel source approval contains invalid Office SDL.");
    }
  }
  if (!isRecord(sdl) || !isRecord(sdl.onCompleteAction) || !isRecord(sdl.onCompleteAction.payload)) {
    throw new Error("Excel source approval is missing Office SDL source details. Check GHCP SDL passthrough.");
  }
  return sdl.onCompleteAction.payload;
}
function readSourceReference(entity) {
  if (!isRecord(entity) || !text(entity.id) && !text(entity.url)) {
    throw new Error("Excel source approval contains an invalid source.");
  }
  const fileName = text(entity.fileName);
  const entityType = text(entity.entityType);
  const url = sourceUrl(entity.url);
  const label = text(entity.displayName) ?? fileName ?? text(entity.url) ?? text(entity.id);
  return {
    title: displayText(label),
    ...fileName ? { fileName: displayText(fileName) } : {},
    ...entityType ? { entityType: displayText(entityType) } : {},
    ...url ? { url } : {}
  };
}
function prepareSourceApproval(request) {
  const schema = request.requestedSchema;
  if (request.mode === "url" || !isRecord(schema?.properties)) {
    return void 0;
  }
  const field = schema.properties.approveAll;
  if (Object.keys(schema.properties).length !== 1 || !isRecord(field) || field.type !== "boolean") {
    return void 0;
  }
  const payload = readSdl(request);
  if (payload.interactionType !== SOURCE_APPROVAL_INTERACTION_TYPE) {
    return void 0;
  }
  if (!text(payload.queryId) || !Array.isArray(payload.entities) || !payload.entities.length) {
    throw new Error("Excel source approval has no valid source snapshot.");
  }
  const sources = payload.entities.map(readSourceReference);
  return {
    sources,
    markdown: [
      "**Verify sources for your request**",
      "Review each source to confirm it\u2019s trusted and relevant. Sensitive information or unintended content from these sources could be visible to anyone with access to this file.",
      formatSourceMarkdownItems(sources.map(({ title, url }) => ({ title, url })))
    ].join("\n\n")
  };
}

// src/runtime/workbook-execution/elicitation/form-validation.ts
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
function createFormAnswerValidator(schema) {
  const ajv = new import__.default({ allErrors: true, strictSchema: true, strictTypes: false });
  (0, import_ajv_formats.default)(ajv);
  ajv.addKeyword({ keyword: "enumNames", schemaType: "array" });
  if (schema.$async === true) {
    throw new Error("Excel elicitation requires a synchronous form schema.");
  }
  const validate = ajv.compile(schema);
  return (content) => {
    if (!validate(content)) {
      throw new Error(`Invalid Excel form answer: ${ajv.errorsText(validate.errors)}`);
    }
    return structuredClone(content);
  };
}

// src/runtime/workbook-execution/controller.ts
function appendApprovedSources(result, sources) {
  if (!isRecord(result) || !sources.length) {
    return result;
  }
  const content = Array.isArray(result.content) ? result.content : result.isError === true ? [] : void 0;
  if (!content) {
    return result;
  }
  const hasStructuredContent = "structuredContent" in result;
  const structuredContent = isRecord(result.structuredContent) ? result.structuredContent : void 0;
  const hasUpstreamProvenance = structuredContent && "workbookProvenance" in structuredContent;
  const snapshot = sources.map((source) => ({ ...source }));
  const markdown = [
    "Sources:",
    "",
    formatSourceMarkdownItems(snapshot, false)
  ].join("\n");
  return {
    ...result,
    content: [...content, { type: "text", text: markdown }],
    ...!hasUpstreamProvenance && (!hasStructuredContent || structuredContent) ? {
      structuredContent: {
        ...structuredContent,
        workbookProvenance: {
          coverage: "approved-only",
          sources: snapshot
        }
      }
    } : {}
  };
}
function createWorkbookExecutionController({
  execute,
  requestElicitation,
  requestTtlMs = 9 * 60 * 1e3
}) {
  if (!Number.isSafeInteger(requestTtlMs) || requestTtlMs <= 0) {
    throw new Error("Excel elicitation timeout must be a positive safe integer in milliseconds.");
  }
  let active;
  async function prompt(operation, request) {
    const { signal } = operation.controller;
    signal.throwIfAborted();
    if (request.mode === "url" || request.requestedSchema?.type !== "object" || !isRecord(request.requestedSchema.properties)) {
      throw new Error("Excel requested an unsupported elicitation form.");
    }
    const expiresAt = Date.now() + requestTtlMs;
    const sourceApproval = prepareSourceApproval(request);
    const validateForm = sourceApproval ? void 0 : createFormAnswerValidator(request.requestedSchema);
    const nativeRequest = sourceApproval ? {
      message: sourceApproval.markdown,
      requestedSchema: { type: "object", properties: {} }
    } : {
      message: request.message,
      requestedSchema: structuredClone(request.requestedSchema)
    };
    let onAbort;
    const cancelled = new Promise((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const timer = setTimeout(
      () => operation.controller.abort(new WorkbookInputStoppedError("expired")),
      Math.max(0, expiresAt - Date.now())
    );
    timer.unref();
    try {
      const pending = Promise.resolve().then(() => {
        signal.throwIfAborted();
        return requestElicitation(nativeRequest);
      });
      operation.prompts.add(pending);
      const settled = () => {
        operation.prompts.delete(pending);
      };
      void pending.then(settled, settled);
      const response = await Promise.race([pending, cancelled]);
      if (Date.now() >= expiresAt) {
        operation.controller.abort(new WorkbookInputStoppedError("expired"));
      }
      if (response.action === "cancel") {
        operation.controller.abort(new WorkbookInputStoppedError("cancelled"));
      }
      signal.throwIfAborted();
      if (response.action !== "accept" && response.action !== "decline") {
        throw new Error("Excel received an invalid elicitation action.");
      }
      if (sourceApproval) {
        const approveAll = response.action === "accept";
        if (approveAll) {
          operation.approvedSources.push(...sourceApproval.sources);
        }
        return { action: "accept", content: { approveAll } };
      }
      if (response.action === "decline") {
        return { action: "decline" };
      }
      if (!isRecord(response.content)) {
        throw new Error("Excel received an invalid form answer.");
      }
      return { action: "accept", content: validateForm(response.content) };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
  return {
    async start(name, args, onProgress) {
      if (active) {
        throw new WorkbookOperationBusyError();
      }
      const metadata = args.xMetadata === void 0 ? {} : args.xMetadata;
      if (!isRecord(metadata)) {
        throw new Error("Excel xMetadata must be an object.");
      }
      const operation = {
        controller: new AbortController(),
        approvedSources: [],
        prompts: /* @__PURE__ */ new Set()
      };
      active = operation;
      try {
        const result = await execute(
          name,
          {
            ...args,
            xMetadata: {
              ...metadata,
              elicitationTimeoutMs: requestTtlMs
            }
          },
          (request) => prompt(operation, request),
          operation.controller.signal,
          (message) => onProgress?.(message)
        );
        operation.controller.signal.throwIfAborted();
        return appendApprovedSources(prepareWorkbookResult(name, result), operation.approvedSources);
      } catch (error) {
        const failure = operation.controller.signal.aborted ? operation.controller.signal.reason ?? error : error;
        operation.controller.abort(failure);
        if (!operation.approvedSources.length) {
          throw failure;
        }
        console.error("[excel-agent] Workbook operation failed:", failure);
        const safeError = userFacingWorkbookError(failure);
        return appendApprovedSources({
          isError: true,
          content: [{ type: "text", text: safeError.message }]
        }, operation.approvedSources);
      } finally {
        const release = () => {
          if (active === operation) active = void 0;
        };
        if (operation.prompts.size) {
          void Promise.allSettled(operation.prompts).then(release);
        } else {
          release();
        }
      }
    },
    cancel() {
      if (!active) {
        return { status: "idle", message: "No Excel operation is running." };
      }
      active.controller.abort(new WorkbookInputStoppedError("cancelled"));
      return { status: "cancelled", message: "Excel cancellation requested. Close any remaining Excel input dialog before starting another operation. Do not automatically retry the mutation." };
    }
  };
}

// src/runtime/workbook-execution/elicitation/native-elicitation.ts
async function requestNativeElicitation(session2, request) {
  if (!session2) {
    throw new Error("The Copilot session is not ready to request user input.");
  }
  const supported = session2.capabilities?.ui?.elicitation;
  if (supported === false) {
    throw new Error("This Copilot host does not support elicitation.");
  }
  if (supported === true && typeof session2.ui?.elicitation === "function") {
    return session2.ui.elicitation(request);
  }
  if (supported === void 0 && typeof session2.rpc?.ui?.elicitation === "function") {
    return session2.rpc.ui.elicitation(request);
  }
  throw new Error("This Copilot host does not expose a compatible elicitation API.");
}

// src/runtime/workbook-tools.ts
var GENERATE_TASK_DESCRIPTION = "Describe the workbook to create in the user's own terms. Preserve every requirement and later refinement, but do not pre-author an outline, repeat grounded data, invent values or sources, add placeholders, or add requirements the user did not request. The Excel capability owns layout, formulas, formatting, and how far to take the request.";
var EDIT_TASK_DESCRIPTION = "Describe only the edits to apply to the existing workbook, in the user's own terms, including what must not change. Do not restate unchanged workbook content, repeat grounded data, invent values or sources, add placeholders, or add requirements the user did not request. The Excel capability reads the existing workbook and owns the implementation.";
var TERMINAL_RESULT_GUIDANCE = ` User input is handled directly by the plugin's native dialogs; terminal text is not another approval request. Explain results and errors in the user's language without internal service names, protocol terms, request IDs, or raw diagnostics. If the terminal result's last content item is a text block beginning "Sources:", reproduce that entire block verbatim as the final block of the chat response. Do not introduce, summarize, rename, reorder, or omit that source block, and do not add any text after it. For creation, only structuredContent.excelWorkbook.artifactUrl confirms a newly returned workbook. If absent, say no new workbook was confirmed; if the response references a previously completed request and URL, identify that link as an earlier workbook, not a new result, and do not open a canvas for it. For editing, a missing resource_link alone is not failure and a link alone does not prove a modification; report only changes the response confirms. On timeout or interrupted transport, say completion cannot be verified. Do not infer success from prior turns or automatically retry.`;
var WORKBOOK_TITLE_SCHEMA = {
  type: "string",
  description: "A short, single-line action summary for this specific request, in the user's language. Display-only, not a file name or an instruction to Excel. Do not copy the full taskDescription, include URLs or internal IDs, invent requirements, or use a fixed generic label.",
  minLength: 1,
  maxLength: 80,
  pattern: "\\S",
  not: { pattern: "[\\r\\n]" }
};
function createWorkbookTools(controller) {
  const start = (name, args, onProgress) => presentWorkbookResult(controller.start(name, args, onProgress));
  const operations = [
    {
      name: "generate_excel_workbook",
      title: "Create Excel workbook",
      description: "Create a new Excel workbook with the Excel agent, including enterprise search and native source approval. Pass the complete request without searching first. The plugin displays source titles and Markdown links in a native confirmation dialog: Accept allows all listed sources, Decline denies their use, and Cancel stops the whole operation. Other forms are also handled natively. Do not ask for approval or clarification separately." + TERMINAL_RESULT_GUIDANCE,
      inputSchema: {
        type: "object",
        properties: {
          title: WORKBOOK_TITLE_SCHEMA,
          taskDescription: {
            type: "string",
            description: GENERATE_TASK_DESCRIPTION,
            minLength: 1
          }
        },
        required: ["title", "taskDescription"],
        additionalProperties: false
      },
      run: (args, onProgress) => start(EXCEL_TASK_NAMES.generate, args, onProgress)
    },
    {
      name: "edit_excel_workbook",
      title: "Edit Excel workbook",
      description: "Edit an existing SharePoint or OneDrive Excel workbook with the Excel agent. The plugin displays source titles and Markdown links in a native confirmation dialog: Accept allows all listed sources, Decline denies their use, and Cancel stops the whole operation. Other forms are also handled natively. Do not ask for approval or clarification separately." + TERMINAL_RESULT_GUIDANCE,
      inputSchema: {
        type: "object",
        properties: {
          title: WORKBOOK_TITLE_SCHEMA,
          artifactUrl: {
            type: "string",
            description: "Canonical HTTPS SharePoint or OneDrive workbook URL.",
            minLength: 1
          },
          taskDescription: {
            type: "string",
            description: EDIT_TASK_DESCRIPTION,
            minLength: 1
          }
        },
        required: ["title", "artifactUrl", "taskDescription"],
        additionalProperties: false
      },
      run: (args, onProgress) => start(EXCEL_TASK_NAMES.edit, args, onProgress)
    }
  ];
  return {
    mcpTools: operations.map(({ name, title, description, inputSchema, run }) => ({
      name,
      title,
      description,
      inputSchema,
      handler: async ({ title: _title, ...args }, { onProgress }) => toMcpToolResult(await run(args, onProgress))
    }))
  };
}
function toMcpToolResult(value) {
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (isObject && (Array.isArray(value.content) || typeof value.isError === "boolean")) {
    return value;
  }
  const text2 = JSON.stringify(value) ?? String(value);
  return {
    content: [{ type: "text", text: text2 }],
    ...isObject ? { structuredContent: value } : {}
  };
}

// src/extension.ts
var OFFICE_MCP_URL = resolveOfficeMcpUrl(process.env.EXCEL_AGENT_USE_LOCAL_AL);
var OFFICE_MCP_FLIGHTS = resolveOfficeMcpFlights(
  OFFICE_MCP_URL,
  process.env.EXCEL_AGENT_USE_LOCAL_OFFICEAGENT
);
var officeConversationId = createOfficeConversationIdProvider(Boolean(OFFICE_MCP_FLIGHTS));
console.error(`[excel-agent] Office MCP endpoint: ${OFFICE_MCP_URL}`);
if (OFFICE_MCP_FLIGHTS) {
  console.error(`[excel-agent] Office MCP flights: ${OFFICE_MCP_FLIGHTS}`);
}
var OFFICE_MCP_TIMEOUT_MS = 30 * 60 * 1e3;
var session;
var authDirectory = join6(
  userStateDirectory(fileURLToPath2(new URL(".", import.meta.url))),
  "ExcelCopilot",
  "auth"
);
var nativeAuthProvider = createNativeAuthProvider({
  workerPath: fileURLToPath2(new URL("./auth/auth-worker.cjs", import.meta.url)),
  product: EXCEL_AUTH_PRODUCT
});
var auth = createAccountAuth({
  selectionPath: join6(authDirectory, "selection.json"),
  provider: nativeAuthProvider,
  product: EXCEL_AUTH_PRODUCT
});
var authInitializationWarning;
try {
  await auth.initialize();
  await nativeAuthProvider({ operation: "validate", scope: OFFICE_SCOPE });
} catch (error) {
  authInitializationWarning = error instanceof Error ? error.message : "Excel authentication is unavailable. Connect again to retry it.";
}
var authStatus = () => ({
  ...auth.status(),
  ...authInitializationWarning ? { warning: authInitializationWarning } : {}
});
var officeTokenProvider = (options = {}) => auth.getToken(OFFICE_SCOPE, options);
var primusViewerHost = createPrimusViewerHost({
  resourceTokenProvider: (scope, options) => auth.getToken(scope, options),
  authStatus,
  onUnauthorized: (scope, claims) => auth.requireInteraction(scope, claims),
  onSelection: ({ instanceId, workbookUrl, sheets }) => session.rpc.extensions.sendAttachmentsToMessage({
    instanceId,
    attachments: [{
      type: "extension_context",
      title: sheets.map(({ name, ranges }) => `${name}!${ranges.join(", ")}`).join("; "),
      payload: { workbookUrl, sheets }
    }]
  }),
  onClose: (instanceId) => session.rpc.canvas.close({ instanceId })
});
auth.configureCoordination({ onAccountChanged: () => primusViewerHost.resetAuthSessions() });
var workbookTools = [];
var proxyServer = await startOfficeTaskProxy({
  port: 0,
  upstreamUrl: OFFICE_MCP_URL,
  idleTimeoutMs: 0,
  workbookTools,
  authorizeFetch: (transport) => createOfficeMetadataFetch(createRenewableOfficeFetch(
    transport,
    officeTokenProvider,
    (claims) => auth.requireInteraction(OFFICE_SCOPE, claims),
    EXCEL_AUTH_PRODUCT
  )),
  primusViewerHost,
  conversationProvider: async () => {
    if (!session) {
      throw new Error("The Copilot session is not ready to provide conversation history.");
    }
    return {
      conversationId: officeConversationId(session.sessionId),
      conversationSchemaVersion: "2",
      conversation: toOfficeConversation(await session.getEvents())
    };
  }
});
var address = proxyServer.address();
if (!address || typeof address === "string") {
  proxyServer.close();
  throw new Error("The Excel MCP proxy did not expose a loopback port.");
}
var proxyOrigin = `http://127.0.0.1:${address.port}`;
proxyServer.unref();
function callExcelTool(name, args, onElicitation, signal, onProgress) {
  return callLocalMcpTool({
    origin: proxyOrigin,
    clientToken: proxyServer.clientToken,
    path: "/mcp",
    name,
    args: {
      ...args,
      appName: "Excel"
    },
    timeoutMs: OFFICE_MCP_TIMEOUT_MS,
    flights: OFFICE_MCP_FLIGHTS,
    onElicitation,
    onProgress,
    signal
  });
}
var uploadWorkbook = createWorkbookUploader({
  callUploadTool: (name, args, requestId) => callLocalMcpTool({
    origin: proxyOrigin,
    clientToken: proxyServer.clientToken,
    path: "/mcp",
    name,
    args,
    timeoutMs: OFFICE_MCP_TIMEOUT_MS,
    flights: [OFFICE_MCP_FLIGHTS, GHCP_UPLOAD_FLIGHT].filter(Boolean).join(";"),
    xMetadata: requestId ? { requestId } : void 0
  })
});
var uploadWithPreview = createUploadWithPreview(uploadWorkbook, ({ name, webUrl }) => openExcelCanvas({
  artifactUrl: webUrl,
  title: name,
  instanceId: "excel-workbook-view",
  mode: "view"
}));
var workbookExecutionController = createWorkbookExecutionController({
  execute: callExcelTool,
  requestElicitation: (request) => requestNativeElicitation(session, request)
});
var { mcpTools } = createWorkbookTools(workbookExecutionController);
workbookTools.push(...mcpTools);
function openExcelCanvas({ artifactUrl, title, instanceId, mode }) {
  return session.rpc.canvas.open({
    canvasId: "excel-canvas",
    instanceId: instanceId || `excel-workbook-${mode || "view"}`,
    input: {
      artifactUrl,
      title,
      mode: mode || "view"
    }
  });
}
var uiMcpServerName = "excel-agent-ui-mcp";
var uiMcpServerConfig = {
  type: "http",
  url: `${proxyOrigin}/ui-mcp`,
  headers: { [LOCAL_CAPABILITY_HEADER]: proxyServer.clientToken },
  timeout: OFFICE_MCP_TIMEOUT_MS
};
try {
  session = await joinSession({
    // Desktop may omit installed plugins from the session's skill discovery.
    pluginDirectories: [fileURLToPath2(new URL("../../../", import.meta.url))],
    mcpServers: {
      [uiMcpServerName]: uiMcpServerConfig
    },
    tools: [
      {
        name: "excel_account_status",
        description: "Show the Excel plugin's selected Microsoft 365 account and sign-in status. Returns no tokens.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => authStatus()
      },
      {
        name: "connect_excel_account",
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
          primusViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "switch_excel_account",
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
          if (workbookExecutionController.cancel().status === "cancelled") {
            return {
              status: "cancelling",
              message: "The running Excel operation is being cancelled. Retry switching accounts."
            };
          }
          const result = await auth.connect({ ...args, switchAccount: true });
          authInitializationWarning = void 0;
          primusViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "disconnect_excel_account",
        description: "Disconnect the Excel plugin and clear its selected identity and in-memory token cache. Does not sign out the OS account or other Office applications.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => {
          if (workbookExecutionController.cancel().status === "cancelled") {
            return {
              status: "cancelling",
              message: "The running Excel operation is being cancelled. Retry disconnecting."
            };
          }
          const result = await auth.disconnect();
          authInitializationWarning = void 0;
          primusViewerHost.resetAuthSessions();
          return result;
        }
      },
      {
        name: "upload_excel_workbook",
        description: "Before calling, visibly tell the user that a separate copy of their explicitly named local .xlsx workbook will be uploaded to their connected OneDrive; the original stays local and unchanged. Uploads up to 12 MB. On success, this tool immediately opens a side-by-side preview and returns the uploaded copy's webUrl: show that URL to the user exactly once, before editing, even if the preview cannot open, and never repeat the link in later messages unless the user asks for it. An unconfirmed upload must not be repeated without checking OneDrive first.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the local .xlsx workbook supplied by the user.",
              minLength: 1
            }
          },
          required: ["path"],
          additionalProperties: false
        },
        // Same presentation as create/edit: a raw throw reaches the host as an opaque
        // "Tool execution failed", losing both the reason and the log line.
        handler: async (args) => presentWorkbookResult(uploadWithPreview(args.path))
      },
      {
        name: "cancel_excel_workbook",
        description: "Cancel the running or pending Excel operation. Call only when the user explicitly asks to stop or abandon it.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        handler: async () => workbookExecutionController.cancel()
      },
      {
        name: "open_excel_canvas",
        description: "Open or focus a trusted SharePoint or OneDrive Excel workbook in the Copilot app canvas.",
        parameters: {
          type: "object",
          properties: {
            artifactUrl: {
              type: "string",
              description: "Canonical HTTPS SharePoint or OneDrive workbook URL."
            },
            title: {
              type: "string",
              description: "Optional workbook name shown in the canvas header."
            },
            instanceId: {
              type: "string",
              description: "Stable canvas instance identifier."
            },
            mode: {
              type: "string",
              enum: ["view", "edit"],
              description: "Open read-only preview mode or editable Excel mode. Defaults to view."
            }
          },
          required: ["artifactUrl"],
          additionalProperties: false
        },
        handler: async (args) => openExcelCanvas(args)
      }
    ],
    canvases: [
      createCanvas({
        id: "excel-canvas",
        displayName: "Excel",
        description: "Open an Office MCP Excel artifact in the Copilot app canvas.",
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
              description: "Optional workbook name shown in the canvas header."
            },
            mode: {
              type: "string",
              enum: ["view", "edit"],
              description: "Read-only preview or editable Excel mode.",
              default: "view"
            }
          },
          required: ["artifactUrl"],
          additionalProperties: false
        },
        actions: [
          {
            name: "refresh_workbook",
            description: "Refresh the currently open Excel canvas after the workbook changes.",
            handler: async () => ({
              refreshedAt: (/* @__PURE__ */ new Date()).toISOString()
            })
          }
        ],
        onClose: (ctx) => primusViewerHost.revokeInstance(ctx.instanceId),
        open: async (ctx) => {
          let url;
          try {
            url = proxyServer.createExcelViewerUrl(
              ctx.input?.artifactUrl,
              ctx.input?.title,
              ctx.input?.mode || "view",
              ctx.instanceId
            );
          } catch (error) {
            throw new CanvasError(
              "invalid_excel_url",
              error instanceof Error ? error.message : String(error)
            );
          }
          const title = typeof ctx.input?.title === "string" && ctx.input.title.trim() ? ctx.input.title.trim() : "Excel";
          return {
            title,
            status: ctx.input?.mode === "edit" ? "Opening authenticated Excel editor" : "Opening Excel preview",
            url
          };
        }
      })
    ]
  });
  await session.rpc.mcp.startServer({
    serverName: uiMcpServerName,
    config: uiMcpServerConfig
  });
} catch (error) {
  proxyServer.close();
  throw error;
}
