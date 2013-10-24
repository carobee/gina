/*
 * This file is part of the geena package.
 * Copyright (c) 2013 Rhinostone <geena@rhinostone.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Geena Bootstrap
 *
 * @package    Geena
 * @author     Rhinostone <geena@rhinostone.com>
 */
var Gna     = {core:{}},
    Config  = require('./config'),
    Server  = require('./server'),
    Util    = require('util'),
    EventEmitter = require('events').EventEmitter;

Gna.Utils = require('geena.utils');
Gna.Model = require('./model');

Log       = Gna.Utils.Logger;

var e = new EventEmitter();
Gna.initialized = false;

/**
 * On User server configuration
 *
 * @callback callback
 *
 * */
Gna.onInitialize = function(callback){
    Gna.initialized = true;
    e.on('init', function(instance, express, conf){

        e.getConfig = function(name){
            //conf
            if ( typeof(name) != 'undefined' ) {
                try {
                    return conf.filesContent[name];
                } catch (err) {
                    return undefined;
                }
            } else {
                return conf;
            }
        };

        e.setConfig = function(name, obj){
            if ( typeof(name) == 'undefined' || name == '' ) {
                var name = 'global';
            }

            if ( typeof(conf.filesContent[name]) != "undefined") {
                Gna.Utils.extend(conf.filesContent[name], obj);
            } else {
                conf.filesContent[name] = obj;
            }
        };

        callback(e, instance, express);
    });
};

/**
 * Start server
 * @param {string} executionPath - Path in option
 * */
Gna.start = function(executionPath){
    //WTF !.
    var core    = Gna.core,
        env     = process.argv[2];

    if(executionPath == undefined){
        var p = new _(process.argv[1]).toUnixStyle().split("/");
        var appName = p[p.length-1].split(".")[0];

        var executionPath = "";
        for(var i=0; i<p.length-1; ++i){
            //if (i < p.length-1)
            executionPath +=  p[i] + '/';
        }
        executionPath = executionPath.substring(0, executionPath.length-1);
    }

    core.executionPath = new _(executionPath).toString();
    core.startingApp = appName;
    core.geenaPath = new _(__dirname).toString();

    //Setting env.
    if (env != 'undefined') {
        Log.setEnv(env);
    }
    //Setting log paths.

    Log.init({
        logs : new _(core.executionPath + '/logs').toString(),
        core: new _(__dirname).toString()
    });

    var config = new Config({
        env : env,
        executionPath : core.executionPath,
        startingApp : core.startingApp
    });

    config.onReady( function(err, obj){
        var isStandalone = obj.isStandalone;

        Log.info('geena', 'CORE:INFO:2', 'Execution Path : ' + core.executionPath);
        Log.info('geena', 'CORE:INFO:3', 'Standalone mode : ' + isStandalone);

        ///console.log("bundlde ocn f",  JSON.stringify(obj, null, '\t') );

        Server.setConf({
                appName         : core.startingApp,
                //Apps list.
                bundles         : obj.bundles,
                allBundles      : obj.allBundles,
                env             : obj.env,
                isStandalone    : isStandalone,
                executionPath   : core.executionPath,
                geenaPath       : core.geenaPath,
                conf            : obj.conf
            },
            function(err, instance, express, conf){
                if (!err) {

                    Log.debug(
                        'geena',
                        'CORE:DEBUG:1',
                        'Server conf loaded',
                        __stack
                    );

                    Log.notice(
                        'geena',
                        'CORE:NOTICE:2',
                        'Starting [' + core.startingApp + '] instance'
                    );
                    //On user conf complete.
                    e.on('complete', function(instance){
                        Server.instance = instance;
                        Server.init();
                    });
                    e.emit('init', instance, express, conf);
                    //In case there is no user init.
                    if (!Gna.initialized) {
                        e.emit('complete', instance);
                    }
                }
            });

    });
};

/**
 * Stop server
 * */
Gna.stop = function(pid, code){
    log("stoped server");
    if(typeof(code) != "undefined")
        process.exit(code);

    process.exit();
};
/**
 * Get Status
 * */
Gna.status = function(){
    log("getting server status");
};
/**
 * Restart server
 * */
Gna.restart = function(){
    log("starting server");
};

module.exports = Gna;