/*
 * This file is part of the geena package.
 * Copyright (c) 2014 Rhinostone <geena@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

//Imports.
var fs              = require('fs');
var EventEmitter    = require('events').EventEmitter;
var utils           = require('./../utils') || require.cache[require.resolve('./../utils')];
var merge           = utils.merge;
var inherits        = utils.inherits;
var swig            = require('swig');


/**
 * @class Controller
 *
 *
 * @package     Geena
 * @namespace
 * @author      Rhinostone <geena@rhinostone.com>
 *
 * @api         Public
 */
function Controller(options) {

    //public
    this.name       = "Controller";
    this._data      = {};

    //private
    var self = this;
    var local = {
        req : null,
        res : null,
        next : null,
        options: options || null
    };

    /**
     * Controller Constructor
     * @constructor
     * */
    var init = function() {
        //_request = request, _response = response, _next = next;
        if ( typeof(Controller.initialized) != 'undefined' ) {
            return getInstance()
        } else {
            Controller.initialized = true;
            Controller.instance = self;
            if (local.options) {
                Controller.instance._options = local.options
            }
        }
    }

    var getInstance = function() {
        local.options = Controller.instance._options;
        self._data = Controller.instance._data;
        return Controller.instance
    }

    var hasViews = function() {
        return ( typeof(local.options.views) != 'undefined' ) ? true : false;
    }

    this.isCacheless = function() {
        return local.options.cacheless
    }

    this.setOptions = function(req, res, next, options) {
        local.options = Controller.instance._options = options;

        local.req = req;
        local.res = res;
        local.next = next;

        getParams(req);
        if ( typeof(local.options.views) != 'undefined' && typeof(local.options.action) != 'undefined' ) {
            var action = local.options.action;
            var ext = 'html';
            if ( typeof(local.options.views.default) != 'undefined' ) {
                ext = local.options.views.default.ext || ext;
            }
            if( !/\./.test(ext) ) {
                ext = '.' + ext;
                local.options.views.default.ext = ext
            }

            var content = action;
            self.set('page.ext', ext);
            self.set('page.content', content);
            self.set('page.action', action);
            self.set('page.title', action);
        }

        if ( hasViews() ) {
            self.set('file', local.options.file);
            self.set('page.title', local.options.file);

            //TODO - detect when to use swig
            var dir = self.views || local.options.views.default.views;
            var swigOptions = {
                loader: swig.loaders.fs(dir),
                cache: (local.options.cacheless) ? false : 'memory'
            };
            swig.setDefaults(swigOptions);
            self.engine = swig;
        }
    }

    /**
     * Set views|templates location
     *
     * @param {string} dir
     * @param {string} [ layout ] - Is by default dir + '/layout.html'
     * */
    this.setViewsLocation = function(dir, layout) {
        local.options.views.default.views = dir;
        local.options.views.default.html = _(dir + '/html');
        local.options.views.default.layout = layout || _(local.options.views.default.html + '/layout.html');
        swig.setDefaults({
            loader: swig.loaders.fs(dir)
        })
    }

    this.hasOptions = function() {
        return ( typeof(local.options) != 'undefined') ? true : false
    }

    /**
     * Set Layout path
     *
     * @param {string} filename
     * */
    this.setLayout = function(filename) {//means path
        local.options.views.default.layout = filename
    }

    /**
     * Render HTML templates : Swig is the default template engine
     *
     * @param {object} _data
     * @return {void}
     * */
    this.render = function(_data) {

        try {

            if (!_data['page']) {
                var data = JSON.parse( JSON.stringify(_data) );
                _data = self.getData();
                _data['page'] = {
                    data: data
                }
            } //else {
             //   _data = merge(_data, self.getData());
            //}

            self.setRessources(local.options.views, _data.file);
            var data = merge(_data, self.getData());

            var path = _(local.options.views.default.html + '/' + data.file );

            if (data.page.ext) {
                path += data.page.ext
            }

            var dic = {};
            for (var d in data.page) {
                dic['page.'+d] = data.page[d]
            }
            // please, do not put any slashes when including...
            // ex.:
            //      html/inc/_partial.html (GOOD)
            //      /html/inc/_partial.html (BAD)
            fs.readFile(path, function (err, content) {
                if (err) {
                    self.throwError(local.res, 500, err.stack);
                    return
                }

                try {
                    content = swig.compile( content.toString() )(data)
                } catch (err) {
                    self.throwError(local.res, 500, '[ '+path+' ]\n' + err.stack);
                    return
                }

                dic['page.content'] = content;

                fs.readFile(local.options.views.default.layout, function(err, layout) {
                    if (err) {
                        self.throwError(local.res, 500, err.stack);
                        return;
                    }
                    layout = layout.toString();
                    layout = whisper(dic, layout, /\{{ ([a-zA-Z.]+) \}}/g );

                    if ( !local.res.headersSent ) {
                        local.res.writeHead(200, { 'Content-Type': 'text/html' });
                        local.res.end(layout);
                        local.res.headersSent = true
                    }
                })
            })
        } catch (err) {
            self.throwError(local.res, 500, err.stack)
        }
    }


    /**
     * Render JSON
     *
     * @param {object|string} jsonObj
     * @return {void}
     * */
    this.renderJSON = function(jsonObj) {
        try {

            if(typeof(local.options) != "undefined" && typeof(local.options.charset) != "undefined"){
                local.res.setHeader("charset", local.options.charset);
            }
            if ( !local.res.get('Content-Type') ) {
                local.res.setHeader("Content-Type", "application/json");
            }
            if ( !local.res.headersSent ) {
                local.res.end(JSON.stringify(jsonObj));
                local.res.headersSent = true
            }
        } catch (err) {
            local.res.end(JSON.stringify({error: err.stack}));
            local.res.headersSent = true;
            console.log(err.stack)
        }

    }

    this.renderTEXT = function(content) {
        if ( typeof(content) != "string" ) {
            var content = content.toString();
        }

        if(typeof(options) != "undefined" && typeof(options.charset) !="undefined") {
            local.res.setHeader("charset", options.charset);
        }
        if ( !local.res.get('Content-Type') ) {
            local.res.setHeader("Content-Type", "text/plain");
        }

        if ( !local.res.headersSent ) {
            local.res.end(content);
            local.res.headersSent = true
        }
    }

    /**
     * Set data
     *
     * @param {string} variable Data name to set
     * @param {string} value Data value to set
     * @return {void}
     * */
    this.set = function(variable, value) {
        self._data[variable] = value
    }

    /**
     * Get data
     *
     * @param {String} variable Data name to set
     * @return {Object | String} data Data object or String
     * */
    this.get = function(variable) {
        return self._data[variable]
    }

    this.setRessources = function(viewConf, localRessources) {
        var res = '',
            tmpRes = {},
            css = {
                media   : "screen",
                rel     : "stylesheet",
                type    : "text/css",
                content : []
            },
            cssStr = ' ',
            js  = {
                type    : "text/javascript",
                content : []
            },
            jsStr = ' ';

        //intercept errors in case of malformed config
        if ( typeof(viewConf) != "object" ) {
            cssStr = viewConf;
            jsStr = viewConf
        }

        //Getting global/default css
        //Default will be completed OR overriden by locals - if options are set to "override_css" : "true" or "override" : "true"
        if( viewConf["default"] ) {
            //Get css
            if( viewConf["default"]["stylesheets"] ) {
                tmpRes = getNodeRes('css', cssStr, viewConf["default"]["stylesheets"], css);
                cssStr = tmpRes.cssStr;
                css = tmpRes.css;
                tmpRes = null
            }
            //Get js
            if( viewConf["default"]["javascripts"] ) {
                tmpRes = getNodeRes('js', jsStr, viewConf["default"]["javascripts"], js);
                jsStr = tmpRes.jsStr;
                js = tmpRes.js;
                tmpRes = null
            }
        }

        //Check if local css exists
        if( viewConf[localRessources] ) {
            //Css override test
            if(viewConf[localRessources]["override_css"] && viewConf[localRessources]["override_css"] == true || viewConf[localRessources]["override"] && viewConf[localRessources]["override"] == true){
                cssStr = "";
                css.content = []
            }
            //Get css
            if( viewConf[localRessources]["stylesheets"] ) {
                tmpRes = getNodeRes('css', cssStr, viewConf[localRessources]["stylesheets"], css);
                cssStr = tmpRes.cssStr;
                css = tmpRes.css;
                tmpRes = null
            }
            //js override test
            if( viewConf[localRessources]["override_js"] && viewConf[localRessources]["override_js"] == true || viewConf[localRessources]["override"] && viewConf[localRessources]["override"] == true ) {
                jsStr = "";
                js.content = []
            }
            //Get js
            if( viewConf[localRessources]["javascripts"] ) {
                tmpRes = getNodeRes('js', jsStr, viewConf[localRessources]["javascripts"], js);
                jsStr = tmpRes.jsStr;
                js = tmpRes.js;
                tmpRes = null
            }
        }

        self.set('page.stylesheets', cssStr);
        self.set('page.scripts', jsStr)
    }

    /**
     * Get node resources
     *
     * @param {string} type
     * @param {string} resStr
     * @param {array} resArr
     * @param {object} resObj
     *
     * @return {object} content
     *
     * @private
     * */
    var getNodeRes = function(type, resStr, resArr, resObj) {
        switch(type){
            case 'css':
                var css = resObj;
                for (var res in resArr) {
                    //means that you will find options.
                    if (typeof(resArr[res]) == "object") {
                        //console.info('found object ', resArr[res]);
                        css.media = (resArr[res].options.media) ? resArr[res].options.media : css.media;
                        css.rel = (resArr[res].options.rel) ? resArr[res].options.rel : css.rel;
                        css.type = (resArr[res].options.type) ? resArr[res].options.type : css.type;
                        if (!css.content[resArr[res]._]) {
                            css.content[resArr[res]._] = '<link href="'+ resArr[res]._ +'" media="'+ css.media +'" rel="'+ css.rel +'" type="'+ css.type +'">';
                            resStr += '\n\t' + css.content[resArr[res]._]
                        }

                    } else {
                        css.content[resArr[res]] = '<link href="'+ resArr[res] +'" media="screen" rel="'+ css.rel +'" type="'+ css.type +'">';
                        resStr += '\n\t' + css.content[resArr[res]]
                    }


                }
                return { css : css, cssStr : resStr }
            break;

            case 'js':
                var js = resObj;
                for (var res in resArr) {
                    //means that you will find options
                    if ( typeof(resArr[res]) == "object" ) {
                        js.type = (resArr[res].options.type) ? resArr[res].options.type : js.type;
                        if (!js.content[resArr[res]._]) {
                            js.content[resArr[res]._] = '<script type="'+ js.type +'" src="'+ resArr[res]._ +'"></script>';
                            resStr += '\n\t' + js.content[resArr[res]._];
                        }

                    } else {
                        js.content[resArr[res]] = '<script type="'+ js.type +'" src="'+ resArr[res] +'"></script>';
                        resStr += '\n\t' + js.content[resArr[res]]
                    }


                }
                return { js : js, jsStr : resStr }
            break;
        }
    }

    /**
     * TODO -  Controller.setMeta()
     * */
    this.setMeta = function(metaName, metacontent) {

    }

    this.getData = function() {
        return refToObj(self._data)
    }

    /**
     * redirect
     *
     * Allows you to redirect to an internal [ route ], an internal [ path ], or an external [ url ]
     * For this to work you have to set in your routing.json a new route using  "param":
     * { "action": "redirect", "route": "one-valid-route" }
     * OR
     * { "action": "redirect", "url": "http://www.somedomain.com/page.html" }
     *
     * if you are free to use the redirection [ code ] of your choice, we've set it to 301 by default
     *
     *
     * @param {object} req
     * @param {object} res
     *
     * @callback [ next ]
     * */
    this.redirect = function(req, res, next) {
        var route = req.routing.param.route;
        var path = req.routing.param.path || "";
        var url = req.routing.param.url;
        var code = req.routing.param.code || 301;
        var keepParams = req.routing.param['keep-params'] || false;
        var conf = self.getConfig();
        var routing = conf.content.routing;
        var wroot = conf.server.webroot;
        var condition = true; //set by default for url @ path redirect

        if (route) { // will go with route first
            condition = ( typeof(routing[route]) != 'undefined') ? true : false;
        }

        if ( !self.forward404Unless(condition, req, res) ) { // forward to 404 if bad route

            if (wroot.substr(wroot.length-1,1) == '/') {
                wroot = wroot.substr(wroot.length-1,1).replace('/', '')
            }

            if (route) { // will go with route first
                path = routing[route].url;
                if (path instanceof Array) {
                    path = path[0] //if it is an array, we just take the first one
                }
                path = conf.hostname + wroot + path;
            } else if (url) {
                path = ( (/\:\/\//).test(url) ) ? url : req.protocol + '://' + url;
            } else {
                path = conf.hostname + wroot + path
            }

            if (req.headersSent) return next();

            res.writeHead(code, { 'Location': path });
            res.end();
            local.res.headersSent = true;// done for the render() method
        }
    }


    /**
     * forward404Unless
     *
     * @param {boolean} condition
     * @param {object} req
     * @param {object} res
     *
     * @callback [ next ]
     * @param {string | boolean} err
     *
     * @return {string | boolean} err
     * */
    this.forward404Unless = function(condition, req, res, next) {
        var pathname = req.url;

        if (!condition) {
            self.throwError(res, 404, 'Page not found\n' + pathname);
            var err = new Error('Page not found\n' + pathname);
            if ( typeof(next) != 'undefined')
                next(err)
            else
                return err
        } else {
            if ( typeof(next) != 'undefined' )
                next(false)
            else
                return false
        }
    }

    /**
     * Get all Params
     * */
    var getParams = function(req) {

        req.getParams = function() {
            // copy
            var params = JSON.parse(JSON.stringify(req.params));
            params = merge(true, params, req.get);
            params = merge(true, params, req.post);
            return params
        }
    }

    /**
     * Get config
     *
     * @param {string} [name] - Conf name without extension.
     * @return {object} result
     *
     * TODO - Protect result
     * */
    this.getConfig = function(name) {
        var tmp = '';
        if ( typeof(name) != 'undefined' ) {
            try {
                // needs to be read only
                tmp = JSON.stringify(local.options.conf.content[name]);
                return JSON.parse(tmp)
            } catch (err) {
                return undefined
            }
        } else {
            tmp = JSON.stringify(local.options.conf);
            return JSON.parse(tmp)
        }
    }

    this.throwError = function(res, code, msg) {
        if (arguments.length < 3) {
            var res = local.res;
            var code = res || 500;
            var msg = code || null;
        }

        if ( !res.headersSent ) {
            if ( !hasViews() ) {
                res.writeHead(code, { 'Content-Type': 'application/json'} );
                res.end(JSON.stringify({
                    status: code,
                    error: 'Error '+ code +'. '+ msg
                }))
            } else {
                res.writeHead(code, { 'Content-Type': 'text/html'} );
                res.end('Error '+ code +'. '+ msg);
                local.res.headersSent = true;
            }
        } else {
            local.next()
        }
    }

    // converting references to objects
    var refToObj = function (arr){
        var tmp = null,
            curObj = {},
            obj = {},
            count = 0,
            data = {},
            last = null;
        for (var r in arr) {
            tmp = r.split(".");
            //Creating structure - Adding sub levels
            for (var o in tmp) {
                count++;
                if (last && typeof(obj[last]) == "undefined") {
                    curObj[last] = {};
                    if (count >= tmp.length) {
                        // assigning.
                        // !!! if null or undefined, it will be ignored while extending.
                        curObj[last][tmp[o]] = (arr[r]) ? arr[r] : "undefined";
                        last = null;
                        count = 0;
                        break
                    } else {
                        curObj[last][tmp[o]] = {}
                    }
                } else if (tmp.length === 1) { //Just one root var
                    curObj[tmp[o]] = (arr[r]) ? arr[r] : "undefined";
                    obj = curObj;
                    break
                }
                obj = curObj;
                last = tmp[o]
            }
            data = merge(true, data, obj);
            obj = {};
            curObj = {}
        }
        return data
    }

    init()
};

Controller = inherits(Controller, EventEmitter);
module.exports = Controller