import XCTest
final class NativeJourneyTests: XCTestCase {
    func testHomeSearchCardsAndHostBack() {
        let app = launch()
        XCTAssertTrue(app.buttons["Khám phá"].waitForExistence(timeout: 10))
        app.buttons["Khám phá"].tap()
        XCTAssertTrue(app.buttons["Thẻ"].waitForExistence(timeout: 5)); app.buttons["Thẻ"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("an uong")
        XCTAssertTrue(app.staticTexts["Hoàn tiền 7% ăn uống"].waitForExistence(timeout: 5))
        let cancel = app.buttons["đóng"].exists ? app.buttons["đóng"] : app.buttons["Cancel"]; cancel.tap(); app.buttons["host.back"].tap()
        scrollTo(app.buttons["Tùy chỉnh Home"], app: app); XCTAssertTrue(app.buttons["Tùy chỉnh Home"].exists)
    }
    func testSampleBridgeDraftAndUnsupportedAI() {
        let app = launch(); app.buttons["Khám phá"].tap(); app.buttons["SDK Demo"].tap()
        let note = app.textFields["Ghi chú mẫu"]
        scrollTo(app.buttons["Ghi mẫu"], app: app)
        XCTAssertTrue(note.waitForExistence(timeout: 5)); app.buttons["Ghi mẫu"].tap()
        assertStatus("Đã ghi vào bộ nhớ host. Chưa lưu bền.", app: app)
        scrollTo(app.buttons["Đọc mẫu"], app: app); app.buttons["Đọc mẫu"].tap()
        assertStatus("Ghi chú trong bộ nhớ: Ghi chú mẫu từ mini-app", app: app)
        let ai = app.buttons["Gửi yêu cầu AI tới host"]
        scrollTo(ai, app: app)
        ai.tap(); app.buttons["Đồng ý cho thao tác này"].tap()
        assertStatus("UNAVAILABLE — Chưa có bộ đọc hóa đơn. Tiếp tục nhập thủ công.", app: app)
        app.buttons["host.close"].tap()
        scrollTo(app.buttons["Tùy chỉnh Home"], app: app); XCTAssertTrue(app.buttons["Tùy chỉnh Home"].exists)
    }
    func testNativeTestEntryOCRAndClose() {
        let app = launch(); app.buttons["Khám phá"].tap(); app.buttons["Test"].tap()
        let ocr = app.buttons["native-test-OCR"]; scrollTo(ocr, app: app); ocr.tap()
        let ocrResult = app.staticTexts["native-test-result-OCR"]; expectation(for: NSPredicate(format: "label CONTAINS %@", "PASS · Vision OCR nhận đúng fixture"), evaluatedWith: ocrResult); waitForExpectations(timeout: 15)
        scrollTo(app.buttons["native-test-Crypto"], app: app); app.buttons["native-test-Crypto"].tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "PASS · Đã ký/verify fixture"), evaluatedWith: app.staticTexts["native-test-result-Crypto"]); waitForExpectations(timeout: 5)
        scrollTo(ocr, app: app); ocr.tap(); app.buttons["host.close"].tap()
        scrollTo(app.buttons["Tùy chỉnh Home"], app: app); XCTAssertTrue(app.buttons["Tùy chỉnh Home"].exists)
    }
    func testSplitBillWebViewBootDraftAndReopen() {
        let app = launch(); app.buttons["Khám phá"].tap(); app.buttons["Chia tiền"].tap()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
        let title = app.webViews.textFields["VD: Ăn tối Quận 1"]
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        title.tap(); title.typeText(" Native draft")
        app.webViews.textFields["Đã chi gì?"].tap()
        Thread.sleep(forTimeInterval: 1) // Existing mini-app saves after its coalescing timer, not on host Close.
        app.buttons["host.close"].tap(); app.buttons["Khám phá"].tap(); app.buttons["Chia tiền"].tap()
        let restored = app.webViews.textFields["VD: Ăn tối Quận 1"]
        XCTAssertTrue(restored.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "value CONTAINS %@", "Native draft"), evaluatedWith: restored); waitForExpectations(timeout: 10)
        app.terminate(); app.launch(); app.buttons["Khám phá"].tap(); app.buttons["Chia tiền"].tap()
        XCTAssertTrue(restored.waitForExistence(timeout: 15))
        expectation(for: NSPredicate(format: "value CONTAINS %@", "Native draft"), evaluatedWith: restored); waitForExpectations(timeout: 10)
    }
    func testManageExpenseManualLedgerSurvivesCloseAndProcessRelaunch() {
        let app = launch()
        func openExpense() {
            app.buttons["Khám phá"].tap()
            XCTAssertTrue(app.navigationBars["Khám phá"].waitForExistence(timeout: 10))
            let search = app.searchFields.firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 5))
            search.tap()
            search.typeText("Quản lý chi tiêu")
            let appEntry = app.buttons["Quản lý chi tiêu"]
            XCTAssertTrue(appEntry.waitForExistence(timeout: 10))
            appEntry.tap()
        }
        openExpense()

        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 15))
        let suffix = String(UUID().uuidString.prefix(8))
        let fundName = "QE Wallet \(suffix)"
        let merchant = "QE Expense \(suffix)"

        let walletTab = web.buttons["Ví & thẻ"].firstMatch
        XCTAssertTrue(walletTab.waitForExistence(timeout: 15))
        walletTab.tap()
        let addFund = web.buttons["Thêm nguồn tiền"].firstMatch
        XCTAssertTrue(addFund.waitForExistence(timeout: 10))
        addFund.tap()
        let fundNameField = web.textFields["Tên hiển thị"]
        XCTAssertTrue(fundNameField.waitForExistence(timeout: 5))
        fundNameField.tap()
        fundNameField.typeText(fundName)
        web.buttons["Lưu nguồn tiền"].tap()
        XCTAssertTrue(web.staticTexts[fundName].waitForExistence(timeout: 10))

        web.buttons["Sổ giao dịch"].firstMatch.tap()
        let addExpense = web.buttons["Thêm giao dịch"].firstMatch
        XCTAssertTrue(addExpense.waitForExistence(timeout: 10))
        addExpense.tap()
        let merchantField = web.textFields["Tên cửa hàng"]
        XCTAssertTrue(merchantField.waitForExistence(timeout: 5))
        merchantField.tap()
        merchantField.typeText(merchant)
        let amountField = web.textFields["Số tiền"]
        amountField.tap()
        amountField.typeText("12345")
        web.buttons["Lưu giao dịch"].tap()
        XCTAssertTrue(web.staticTexts[merchant].waitForExistence(timeout: 10))

        app.buttons["host.close"].tap()
        openExpense()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        let reopenedWeb = app.webViews.firstMatch
        reopenedWeb.buttons["Sổ giao dịch"].firstMatch.tap()
        XCTAssertTrue(reopenedWeb.staticTexts[merchant].waitForExistence(timeout: 15))

        app.terminate()
        app.launch()
        openExpense()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        let relaunchedWeb = app.webViews.firstMatch
        relaunchedWeb.buttons["Sổ giao dịch"].firstMatch.tap()
        XCTAssertTrue(relaunchedWeb.staticTexts[merchant].waitForExistence(timeout: 15))
        relaunchedWeb.buttons["Ví & thẻ"].firstMatch.tap()
        XCTAssertTrue(relaunchedWeb.staticTexts[fundName].waitForExistence(timeout: 15))
    }
    private func launch() -> XCUIApplication { let app = XCUIApplication(); app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]; app.launch(); return app }
    private func scrollTo(_ element: XCUIElement, app: XCUIApplication) { for _ in 0..<8 { if element.exists && element.isHittable { return }; app.swipeUp() }; for _ in 0..<12 { if element.exists && element.isHittable { return }; app.swipeDown() }; XCTFail("Element not hittable: \(element)") }
    private func assertStatus(_ value: String, app: XCUIApplication) {
        let status = app.staticTexts["sample.status"]
        for _ in 0..<12 { if status.exists && status.isHittable { break }; app.swipeDown() }
        let predicate = NSPredicate(format: "label == %@", value)
        expectation(for: predicate, evaluatedWith: status); waitForExpectations(timeout: 5)
    }
}
