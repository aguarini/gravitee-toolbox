const {CliCommand} = require('./lib/cli-command');
const { flatMap, map, reduce, tap } = require('rxjs/operators');
const Rx = require('rxjs');
const util = require('util');

const NO_DELAY_PERIOD = 0;

/**
 * Get API details.
 *
 * @author Alexandre Carbenay
 */
class ApiDetails extends CliCommand {

    constructor() {
        super(
            'get-api-details',
            'Display API details',
            {
                'api-id': {
                    describe: 'API UUID',
                    type: 'string'
                },
                'filter-plan-status': {
                    describe: 'Status to filter on API plans',
                    type: 'string',
                    choices: ['staging', 'published', 'deprecated', 'closed'],
                    default: ['staging', 'published', 'deprecated', 'closed']
                },
                'filter-subscription-status': {
                    describe: 'Status to filter on API subscriptions',
                    type: 'string',
                    choices: ['ACCEPTED', 'PENDING', 'PAUSED', 'REJECTED', 'CLOSED'],
                    default: ['ACCEPTED', 'PENDING', 'PAUSED']
                }
            }
        );
    }

    definition(managementApi) {
        return managementApi.login(this.argv['username'], this.argv['password']).pipe(
                flatMap(_token => managementApi.getApi(this.argv['api-id'])),
                map(api => Object.assign({api: api})),
                flatMap(details => this.enrichEndpointGroups(details.api.proxy.groups, details)),
                flatMap(details => this.enrichApiPlans(managementApi, this.argv['api-id'], details)),
                flatMap(details => this.enrichApiSubscriptions(managementApi, this.argv['api-id'], details))
            )
            .subscribe(this.defaultSubscriber(
                details => this.displayRaw(util.format('[%s, %s, %s <%s>] %s\nPlans:%s\nSubscriptions:%s\nEndpoints:%s',
                    details.api.id,
                    details.api.context_path,
                    details.api.owner.displayName,
                    details.api.owner.email,
                    details.api.name,
                    details.plans,
                    details.subscriptions,
                    details.endpointGroups
                ))
            ));
    }

    enrichApiPlans(managementApi, apiId, details) {
        return managementApi.getApiPlans(apiId, this.argv['filter-plan-status']).pipe(
            flatMap(plans => Rx.from(plans).pipe(
                map(plan => util.format('\t%s (%s), %s, %s, %s',
                    plan.name,
                    plan.description,
                    plan.status,
                    plan.security,
                    plan.validation
                )),
                reduce((acc, plan) => acc + "\n" + plan, "")
            )),
            tap(plans => details.plans = plans),
            map(plans => details)
        );
    }

    enrichApiSubscriptions(managementApi, apiId, details) {
        return managementApi.getApiSubscriptions(apiId, this.argv['filter-subscription-status'], 100).pipe(
            flatMap(subscriptions => Rx.from(subscriptions.data).pipe(
                map(subscription => util.format('\t%s, %s, %s',
                    subscriptions.metadata[subscription.application].name,
                    subscriptions.metadata[subscription.plan].name,
                    subscription.status
                )),
                reduce((acc, plan) => acc + "\n" + plan, "")
            )),
            tap(subscriptions => details.subscriptions = subscriptions),
            map(subscriptions => details)
        );
    }

    enrichEndpointGroups(groups, details) {
        return Rx.from(groups).pipe(
            map(group => util.format('\t%s%s',
                group.name,
                this.extractEndpoints(group.endpoints)
            )),
            reduce((acc, group) => acc + "\n" + group, ""),
            tap(groups => details.endpointGroups = groups),
            map(groups => details)
        );
    }

    extractEndpoints(endpoints) {
        return endpoints.map(endpoint => util.format('\t\t%s, %s%s',
                endpoint.name,
                endpoint.target,
                endpoint.tenants ? ', ' + endpoint.tenants : ''
            )).reduce((acc, endpoint) => acc + "\n" + endpoint, "");
    }

}

new ApiDetails().run();
