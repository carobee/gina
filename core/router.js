/*
 * This file is part of the gina package.
 * Copyright (c) 2015 Rhinostone <gina@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */


//Imports.

var url                 = require('url')
    , fs                = require('fs')
    , utils             = require('./utils')
    , console           = utils.logger
    , inherits          = utils.inherits
    , SuperController   = require('./controller')
    , Config            = require('./config')
    //init
    , config            = new Config();

/**
 * @class Router
 *
 *
 * @package     Gina
 * @namespace
 * @author      Rhinostone <gina@rhinostone.com>
 * @api         Public
 */
function Router(env) {

    this.name = 'Router';
    var self = this
        , local = {
            conf    : config.getInstance(),
            bundle  : null
        };

    /**
     * Router Constructor
     * @constructor
     * */
    var init = function(){
        if ( typeof(Router.initialized) != "undefined" ) {
            return self.getInstance()
        } else {
            Router.initialized = true
        }
    }

    /**
     * Check if rule has params
     *
     * @param {string} pathname
     * @return {boolean} found
     *
     * @private
     * */
    var hasParams = function(pathname) {
        var patt = /:/;
        return ( patt.test(pathname) ) ? true : false
    }

    this.setMiddlewareInstance = function(instance) {
        self.middlewareInstance = instance
    }

    this.getInstance = function() {
        return self
    }

    var parseRouting = function(request, params, route) {
        var uRe     = params.url.split(/\//)
            , uRo   = route.split(/\//)
            , score = 0
            , r     = {}
            , i     = 0;

        //attaching routing description for this request
        request.routing = params; // can be retried in controller with: req.routing

        if (uRe.length === uRo.length) {
            var maxLen = uRo.length;
            //console.info("-----------------FOUND MATCHING SCORE", uRe.length, uRo.length);
            //console.info(uRe, uRo);
            for (; i<maxLen; ++i) {
                if (uRe[i] === uRo[i])
                    ++score
                else if (hasParams(uRo[i]) && fitsWithRequirements(request, uRo[i], uRe[i], params))
                    ++score
            }
        }
        r.past = (score === maxLen) ? true : false;
        r.request = request;
        return r
    }
    /**
     * Compare urls
     *
     * @param {object} request
     * @param {object} params - Route params
     * @param {string} urlRouting
     *
     * @return {object|false} routes
     * */
    this.compareUrls = function(request, params, urlRouting) {

        if ( typeof(urlRouting) == 'object' ) {
            var i = 0
                , res = {
                    past : false,
                    request : request
                };
            while (i < urlRouting.count() && !res.past) {
                res = parseRouting(request, params, urlRouting[i]);
                ++i
            }
            return res
        } else {
            return parseRouting(request, params, urlRouting)
        }
    }

    /**
     * Fits with requiremements
     * http://en.wikipedia.org/wiki/Regular_expression
     *
     * @param {string} urlVar
     * @param {string} urlVal
     * @param {object} params
     *
     * @return {boolean} true|false - True if fits
     *
     * @private
     * */
    var fitsWithRequirements = function(request, urlVar, urlVal, params) {

        urlVar = urlVar.replace(/:/, '');
        var v = null;

        //console.info("ROUTE !!! ", urlVar, params.requirements);
        if (
            typeof(params.requirements) != 'undefined' &&
            typeof(params.requirements[urlVar]) != 'undefined'
            ) {
            v = urlVal.match(params.requirements[urlVar]);
            //console.info('does it match ?', v);
            //works with regex like "([0-9]*)"
            //console.log("PARAMMMMM !!! ", urlVar, params.requireclearments[urlVar], params.requirements);
            if (v != null && v[0] !== '') {
                request.params[urlVar] = v[0]
            }
        }
        return (v != null && v[0] == urlVal && v[0] != '') ? true : false
    }

    var refreshCore = function() {
        var core = new RegExp( getPath('gina.core') );
        //var lib =  new RegExp( getPath('local.conf[local.bundle][local.env].libPath') );
        var excluded = [
            _(getPath('gina.core') + '/gna.js', true)
        ];

        for (var c in require.cache) {
            if ( (core).test(c) && excluded.indexOf(c) < 0 ) {
                require.cache[c].exports = require( _(c, true) )
            }
        }

        //update utils
        delete require.cache[_(getPath('gina.core') +'/utils/index.js', true)];
        require.cache[_(getPath('gina.core') +'/utils/index.js', true)] = require( _(getPath('gina.core') +'/utils/index.js', true) );
        require.cache[_(getPath('gina.core') + '/gna.js', true)].exports.utils = require.cache[_(getPath('gina.core') +'/utils/index.js', true)];

        // Super controller
        delete require.cache[_(getPath('gina.core') +'/controller/index.js', true)];
        require.cache[_(getPath('gina.core') +'/controller/index.js', true)] = require( _(getPath('gina.core') +'/controller/index.js', true) );
        SuperController = require.cache[_(getPath('gina.core') +'/controller/index.js', true)];


        //update server


        //TODO - do the same with lib
    }

    /**
     * Route on the fly
     *
     * @param {object} request
     * @param {object} response
     * @param {object} params - Route params
     *
     * @callback next
     * */
    this.route = function(request, response, next, params) {

        //Routing.
        var pathname        = url.parse(request.url).pathname;
        var bundle          = local.bundle = params.bundle;
        var conf            = config.Env.getConf( bundle, env );
        local.conf = conf;
        var action          = request.action = params.param.action;
        var middleware      = params.middleware || [];
        var actionFile      = params.param.file;
        var namespace       = params.param.namespace;
        var routeHasViews   = ( typeof(conf.content.views) != 'undefined' ) ? true : false;
        local.routeHasViews = routeHasViews;

        var cacheless = (process.env.IS_CACHELESS == 'false') ? false : true;
        local.cacheless = cacheless;

        if (cacheless) refreshCore();


        console.debug("routing content : \n", bundle, env,  JSON.stringify( conf, null, 4) );

        //Middleware Filters when declared.
        var resHeaders = conf.server.response.header;
        //TODO - to test
        if ( resHeaders.count() > 0 ) {
            for (var h in resHeaders) {
                response.setHeader(h, resHeaders[h])
            }
        }

        //logger.debug('gina', 'ROUTER:DEBUG:1', 'ACTION ON  ROUTING IS : ' + action, __stack);
        console.debug('ACTION ON  ROUTING IS : ' + action);

        //Getting superCleasses & extending it with super Models.
        var controllerFile = conf.bundlesPath +'/'+ bundle + '/controllers/controller.js';

        var options = {
            action          : action,
            file            : actionFile,
            bundle          : bundle,//module
            bundlePath      : conf.bundlesPath +'/'+ bundle,
            rootPath        : self.executionPath,
            conf            : conf,
            instance        : self.middlewareInstance,
            views           : ( routeHasViews ) ? conf.content.views : undefined,
            cacheless       : cacheless
        };



        try {
            // TODO - namespace handling
            //if ( typeof(namespace) != 'undefined' ) {

            if (cacheless) delete require.cache[_(controllerFile, true)];
            var Controller  = require(_(controllerFile, true))
        } catch (err) {
            var superController = new SuperController(options);
            superController.setOptions(request, response, next, options);
            console.log(err.stack);
            superController.throwError(response, 500, err.stack);
            process.exit(1)
        }

        // about to contact Controller ...
        // namespaces should be supported for every bundles
        if ( typeof(namespace) != 'undefined' && namespace == 'framework' ) {
            Controller = SuperController.prototype[namespace];
        }

        Controller = inherits(Controller, SuperController);
        try {
            var controller = new Controller(options);
            controller.setOptions(request, response, next, options);

            if (middleware.length > 0) {
                processMiddlewares(middleware, action, request, response, next,
                    function onDone(action, request, response, next){
                        controller[action](request, response, next)
                    })
            } else {
                controller[action](request, response, next)
            }

        } catch (err) {
            var superController = new SuperController(options);
            superController.setOptions(request, response, next, options);
            superController.throwError(response, 500, err.stack);
        }

        action = null
    };//EO route()

    var processMiddlewares = function(middlewares, action, req, res, next, cb){

        var filename = _(local.conf.bundlePath)
            , middleware = {}
            , constructor = null
            , re = new RegExp('^'+filename);

        if ( middlewares.length > 0 ) {
            for (var m=0; m<middlewares.length; ++m) {
                constructor = middlewares[m].split(/\./g);
                constructor = constructor
                    .splice(constructor.length-1,1)
                    .toString();
                middleware = middlewares[m].split(/\./g);
                middleware.splice(middleware.length-1);
                middleware = middleware.join('/');
                filename = _(filename +'/'+ middleware + '/index.js');
                if ( !fs.existsSync( filename ) ) {
                    // no middleware found with this alias
                    throwError(res, 501, new Error('middleware not found '+ middleware).stack);
                }

                //if (local.cacheless) {
                //    // because of the /index.js and sub files
                //    for (var p in require.cache) {
                //        if ( re.test(p) ) {
                //            delete require.cache[p]
                //        }
                //    }
                //}

                delete require.cache[_(filename, true)];

                middleware = require(_(filename, true));
                if ( !middleware[constructor] ) {
                    throwError(res, 501, new Error('contructor [ '+constructor+' ] not found @'+ middlewares[m]).stack);
                }

                if ( typeof(middleware[constructor]) != 'undefined') {

                    // exporting config
                    middleware.getConfig = function(name){
                        var tmp = null;
                        if ( typeof(name) != 'undefined' ) {
                            try {
                                //Protect it.
                                tmp = JSON.stringify(local.conf.content[name]);
                                return JSON.parse(tmp)
                            } catch (err) {
                                console.error(err.stack);
                                return undefined
                            }
                        } else {
                            tmp = JSON.stringify(local.conf);
                            return JSON.parse(tmp)
                        }
                    };
                    middleware.throwError = throwError;

                    middleware[constructor](req, res, next,
                        function onMiddlewareProcessed(req, res, next){
                            middlewares.splice(m, 1);
                            processMiddlewares(middlewares, action,  req, res, next, cb)
                        }
                    );
                    break
                }
            }

        } else {
            cb(action, req, res, next)
        }
    };

    var hasViews = function() {
        return local.routeHasViews;
    };

    var throwError = function(res, code, msg) {
        if (arguments.length < 3) {
            var res = local.res;
            var code = res || 500;
            var msg = code || null;
            if ( typeof(msg) != 'string' ) {
                msg = JSON.stringify(msg)
            }
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
    };

    init()
};

module.exports = Router