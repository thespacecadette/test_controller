class Instance {
	constructor() {}
	public create(name: string): any {}
}
function findOne(query: any, fn: (error: string, log: any) => any): any {
	// code
}

export default {
	Instance,
	findOne,
};
