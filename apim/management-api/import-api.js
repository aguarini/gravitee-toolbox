const ManagementApiScript = require('./lib/management-api-script');
const { flatMap, toArray, map } = require('rxjs/operators');
const { throwError } = require('rxjs');
const util = require('util');
const fsp = require('fs').promises
const Rx = require('rxjs');

/**
 * Import existing API (update) depending a search. Import only if search returns exactly one result.
 * 
 * @author Soann Dewasme
 */
class ImportApi extends ManagementApiScript {

    constructor() {
        super(
            'import-api', {
                'f': {
                    alias: "filepath",
                    describe: "File path containing API definition to import",
                    type: 'string',
                    demandOption: true
                },
                'd': {
                    alias: "deploy",
                    describe: "Deploy after import",
                    type: 'boolean',
                    default: false
                },
                'n': {
                    alias: "new",
                    describe: "Import a new API",
                    type: 'boolean',
                    default: false
                },
                'e': {
                    alias: "encoding",
                    describe: "Imported file encoding",
                    type: 'string',
                    default: 'utf8'
                },
                'filter-by-free-text': {
                    describe: "Filter APIs by a free text (full text search)"
                },
                'filter-by-context-path': {
                    describe: "Filter APIs against context-path (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-group-name': {
                    describe: "Filter APIs against endpoint group name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-name': {
                    describe: "Filter APIs against endpoint name (regex)",
                    type: 'string'
                },
                'filter-by-endpoint-target': {
                    describe: "Filter APIs against endpoint target (regex)",
                    type: 'string'
                }
            }
        );
    }

    definition(managementApi) {
        managementApi
            .login(this.argv['username'], this.argv['password'])
            .pipe(
                flatMap(_token => {
                    // In case of new API, we do not need to get APIs
                    if (this.argv['new']) {
                        return Rx.from(fsp.readFile(this.argv['filepath'], this.argv['encoding']))
                            .pipe(
                                // Map to JSON object
                                map(x => Object.assign({ content: x, id: null }))
                            );
                    }

                    // Search APIs
                    return managementApi.listApis({
                        byFreeText: this.argv['filter-by-free-text'],
                        byContextPath: this.argv['filter-by-context-path'],
                        byEndpointGroupName: this.argv['filter-by-endpoint-group-name'],
                        byEndpointName: this.argv['filter-by-endpoint-name'],
                        byEndpointTarget: this.argv['filter-by-endpoint-target']
                    }).pipe(
                        // Merge all APIs emitted into array
                        toArray(),
                        flatMap(apis => {
                            // Throw error if more (or less) than one result
                            if (apis.length !== 1) {
                                var msg = util.format('%s APIs found, must find a single result. Be more precise in filters.', apis.length);
                                apis.forEach(function (api) {
                                    msg = msg + util.format('\n   - %s (%s)', api.name, api.proxy.context_path);
                                });
                                return throwError(msg);
                            }

                            // Return promise with import file content
                            return Rx.from(fsp.readFile(this.argv['filepath'], this.argv['encoding']))
                                .pipe(
                                    // Add id to json object (for update)
                                    map(x => Object.assign({ content: x }, { id: apis[0].id }))
                                );
                        })
                    )
                }),
                // Import and deploy if flag is set
                flatMap(api => (!this.argv['deploy']) ? managementApi.import(api.content, api.id) :
                    managementApi.import(api.content, api.id)
                        .pipe(
                            flatMap(importedApi => managementApi.deploy(importedApi.id))
                        )
                )
            )
            .subscribe(
                this.defaultSubscriber(
                    () => { },
                    error => {
                        const errorMessage = error.hasOwnProperty('message') && error.hasOwnProperty('response')
                            ? util.format('%s. Response body is <%s>)', error.message, util.inspect(error.response.data))
                            : error;
                        this.displayError(errorMessage);
                        process.exit(1);
                    }
                )
            );
    }
}

new ImportApi().run();