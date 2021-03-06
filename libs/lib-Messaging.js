class Messaging {
	constructor(utils) {
		this.utils = utils
	}

	/**
	* @param {String} message - message
	* @return {Array<String>} all tags
	*/
	getMessageTags(message) {
		const matches = message.match(/#[a-zA-Z0-9-_]+#/gm)
		return Array.isArray(matches) ? matches.map(tag => tag.replace(/#/g, "").trim()) : []
	}
	/**
	 * @description Function used to inflate a template message
	 * @param {String} message - Message to inflate
	 * @param {Object|null} tags - Object containing all necessary data to inflate the message
	 * @param {Object|null} firstName - firstName of the person to message, to bypass the one from the spreadsheet it unavailable there
	 * @return {String} - inflated message
	 */
	forgeMessage(message, tags, firstName) {
		const matches = message.match(/#[a-zA-Z0-9-_]+#/gm)
		if (Array.isArray(matches)) {
			for (const one of matches) {
				let field = one.replace(/#/g, "")
				if (tags[field]) {
					message = message.replace(one, tags[field])
				} else if (tags[field] === "firstName" && firstName) {
					message = message.replace(one, firstName)
				} else {
					message = message.replace(one, "")
					this.utils.log(`Tag ${one} can't be found in the given profile`, "warning")
				}
			}
		}
		return message
	}

}

module.exports = Messaging
