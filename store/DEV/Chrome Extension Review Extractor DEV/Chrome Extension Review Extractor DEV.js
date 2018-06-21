// Phantombuster configuration {
"phantombuster command: nodejs"
"phantombuster package: 5"
"phantombuster dependencies: lib-StoreUtilities.js"

const { URL } = require("url")

const Buster = require("phantombuster")
const buster = new Buster()

const Nick = require("nickjs")
const nick = new Nick({
	loadImages: false,
	printPageErrors: false,
	printRessourceErrors: false,
	printNavigation: false,
	printAborts: false,
	debug: false
})

const StoreUtilities = require("./lib-StoreUtilities")
const utils = new StoreUtilities(nick, buster)
const DB_NAME = "result.csv"
const SHORT_DB_NAME = DB_NAME.split(".").shift()
const DEFAULT_URLS_PER_LAUNCH = 2

const selectors = {
	rootSelector: "div[role=dialog]",
	reviewsTabSelector: "div[role=tablist] > div[role=tab]:nth-child(2)",
	reviewsPanelSelector: "div[role=tablist] ~ div:nth-child(3) div[webstore-source=ReviewsTab]"
}
// }

const filterUrls = (str, db) => {
	for (const line of db) {
		if (str === line.url) {
			return false
		}
	}
	return true
}

const getUrlsToScrape = (data, urlsPerLaunch) => {
	let i = 0
	const maxLength = data.length
	const urls = []

	if (maxLength === 0) {
		utils.log("Input is empty OR all urls are already scraped", "warning")
		nick.exit(0)
	}

	while (i < urlsPerLaunch && i < maxLength) {
		const row = Math.floor(Math.random() * data.length)
		urls.push(data[row])
		data.splice(row, 1)
		i++
	}
	return urls
}

const handleSpreadsheet = async (url, column) => {
	const urls = []
	try {
		let tmp = await utils.getDataFromCsv(url, column)
		urls.push(...tmp)
	} catch (err) {
		urls.push(url)
	}
	return urls
}

/**
 * @internal
 * @description Function used in forgeUrls
 * @param {String} url - A single URL
 * @return {String}
 */
const _forge = url => {
	let tmp
	try {
		tmp = new URL(url)
		if (tmp.pathname.indexOf("/reviews") < 0) {
			tmp.pathname = tmp.pathname.concat(tmp.pathname.endsWith("/") ? "reviews/" : "/reviews")
		}
		return tmp.toString()
	} catch (err) {
		return url
	}
}

/**
 * @description Simple wrapper used to append if needed "/reviews" on URL pathname
 * @param {Array<String>|String} urls URLs to clean
 * @return {Array<String>|String} URLs
 */
const forgeUrls = urls => {
	let toRet = []
	if (Array.isArray(urls)) {
		toRet = urls.map(el => _forge(el))
	} else {
		toRet = _forge(urls)
	}
	return toRet
}

const getReviews = (arg, cb) => {
	const reviewRootElement = Array.from(document.querySelectorAll(arg.selectors.reviewsPanelSelector)).pop()
	const reviews = Array.from(reviewRootElement.querySelectorAll("div")).filter(el => el.attributes["ga:annotation-index"])
	const toRet = reviews.map(el => {
		const review = {}
		review.profileImg = el.querySelector("img") ? el.querySelector("img").src : ""

		const reviewer = el.querySelector("div a.comment-thread-displayname")
		if (reviewer) {
			review.name = reviewer.textContent.trim()
			review.profileLink = reviewer.href
		}
		review.time = el.querySelector("span").textContent
		review.mark = el.querySelectorAll("div.rsw-starred").length
		review.note = el.querySelector("div[dir=auto]").textContent
		review.url = arg.url
		return review
	})
	cb(null, toRet)
}

/**
 * @async
 * @description Function used to scrape a single extension review
 * @param {Object} tab - Nickjs Tab instance
 * @param {String} url - Extension review URLs
 * @return {Promise<Array<String>>} Array containing all reviews or an empty array is an error happened
 */
const scrapeReview = async (tab, url) => {
	try {
		const [httpCode] = await tab.open(forgeUrls(url))
		if ((httpCode >= 300) || (httpCode < 200)) {
			utils.log(`Expecting HTTP code 200, but got ${httpCode} when opening URL: ${url}`, "warning")
			return []
		}
		await tab.waitUntilVisible([ selectors.rootSelector, selectors.reviewsPanelSelector ], 7500, "and")
		return await tab.evaluate(getReviews, { selectors, url })
	} catch (err) {
		utils.log(err.message || err, "warning")
		return []
	}
}

;(async () => {
	const tab = await nick.newTab()
	let { spreadsheetUrl, columnName, extensionsPerLaunch } = utils.validateArguments()
	let urls = []
	const scrapingRes = []
	let i = 0
	let db = await utils.getDb(DB_NAME)

	if (!extensionsPerLaunch) {
		extensionsPerLaunch = DEFAULT_URLS_PER_LAUNCH
	}

	if (spreadsheetUrl) {
		const queries = await handleSpreadsheet(spreadsheetUrl, columnName)
		urls = urls.concat(queries)
	} else {
		utils.log("You need to set a Spreadsheet OR an extension review URL in your API configuration.", "error")
		nick.exit(1)
	}

	urls = getUrlsToScrape(urls.filter(el => filterUrls(el, db)), extensionsPerLaunch)

	for (const url of urls) {
		const timeLeft = await utils.checkTimeLeft()
		if (!timeLeft.timeLeft) {
			utils.log(timeLeft.message, "warning")
			break
		}
		utils.log(`Scraping ${url}`, "loading")
		buster.progressHint((i + 1) / urls.length, `${url}`)
		const reviewRes = await scrapeReview(tab, url)
		utils.log(`Got ${reviewRes.length} reviews for ${url}`, "done")
		scrapingRes.push(...reviewRes)
		i++
	}

	db = db.concat(scrapingRes)

	await utils.saveResults(scrapingRes, db, SHORT_DB_NAME, null, false)
	nick.exit()
})()
.catch(err => {
	utils.log(err.message || err, "error")
	utils.log(err.stack || "", "error")
	nick.exit(1)
})
