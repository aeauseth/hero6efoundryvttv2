import { setQuenchTimeout } from "./quench-helper.mjs";

import {
    numberToOneDecimalDigit,
    roundFavorPlayerTowardsZero,
    roundFavorPlayerAwayFromZero,
} from "../utility/round.mjs";

export function registerHeroMathTests(quench) {
    quench.registerBatch(
        `${game.system.id}.hero.rounding`,
        (context) => {
            const { describe, expect, it } = context;

            describe("Hero Math Tests", function () {
                // The default timeout tends to be insufficient with multiple actors being created at the same time.
                setQuenchTimeout(this);

                describe("numberToOneDecimalPlace", function () {
                    describe("integer numbers", function () {
                        it("should not change -2000000", function () {
                            expect(numberToOneDecimalDigit(-2000000)).to.equal(-2000000);
                        });

                        it("should not change -2", function () {
                            expect(numberToOneDecimalDigit(-2)).to.equal(-2);
                        });

                        it("should not change 0", function () {
                            expect(numberToOneDecimalDigit(0)).to.equal(0);
                        });

                        it("should not change 2", function () {
                            expect(numberToOneDecimalDigit(2)).to.equal(2);
                        });

                        it("should not change 2000000", function () {
                            expect(numberToOneDecimalDigit(2000000)).to.equal(2000000);
                        });
                    });

                    describe("numbers with 1 decimal", function () {
                        it("should not change -2.1", function () {
                            expect(numberToOneDecimalDigit(-2.1)).to.equal(-2.1);
                        });

                        it("should not change -1.9", function () {
                            expect(numberToOneDecimalDigit(-1.9)).to.equal(-1.9);
                        });

                        it("should not change 0.1", function () {
                            expect(numberToOneDecimalDigit(0.1)).to.equal(0.1);
                        });

                        it("should not change 1.9", function () {
                            expect(numberToOneDecimalDigit(1.9)).to.equal(1.9);
                        });

                        it("should not change 2.1", function () {
                            expect(numberToOneDecimalDigit(2.1)).to.equal(2.1);
                        });
                    });

                    describe("numbers with 2 decimals", function () {
                        it("should change -1.91", function () {
                            expect(numberToOneDecimalDigit(-1.91)).to.equal(-1.9);
                        });

                        it("should change -1.99", function () {
                            expect(numberToOneDecimalDigit(-1.99)).to.equal(-1.9);
                        });

                        it("should change 1.91", function () {
                            expect(numberToOneDecimalDigit(1.91)).to.equal(1.9);
                        });

                        it("should change 1.99", function () {
                            expect(numberToOneDecimalDigit(1.99)).to.equal(1.9);
                        });
                    });

                    describe("numbers with 3 decimals", function () {
                        it("should change -1.501", function () {
                            expect(numberToOneDecimalDigit(-1.501)).to.equal(-1.5);
                        });

                        it("should change -1.499", function () {
                            expect(numberToOneDecimalDigit(-1.499)).to.equal(-1.4);
                        });

                        it("should change -0.999", function () {
                            expect(numberToOneDecimalDigit(-0.999)).to.equal(-0.9);
                        });

                        it("should change 0.999", function () {
                            expect(numberToOneDecimalDigit(0.999)).to.equal(0.9);
                        });

                        it("should change 1.499", function () {
                            expect(numberToOneDecimalDigit(1.499)).to.equal(1.4);
                        });

                        it("should not change 1.501", function () {
                            expect(numberToOneDecimalDigit(1.501)).to.equal(1.5);
                        });
                    });

                    describe("calculations", function () {
                        it("should change 8/1.75", function () {
                            // 8 / 1.75 = 4.571428571428571 => 4.5
                            expect(numberToOneDecimalDigit(8 / 1.75)).to.equal(4.5);
                        });

                        it("should change 8/2.25", function () {
                            // 8 / 2.25 = 3.5556 => 3.5
                            expect(numberToOneDecimalDigit(8 / 2.25)).to.equal(3.5);
                        });

                        it("should change 8/3.25", function () {
                            // 8 / 3.25 = 2.4615 => 2.4
                            expect(numberToOneDecimalDigit(8 / 3.25)).to.equal(2.4);
                        });

                        it("should change 13/1.75", function () {
                            // 13 / 1.75 => 7.4286 => 7.4
                            expect(numberToOneDecimalDigit(13 / 1.75)).to.equal(7.4);
                        });

                        it("should change 29/2.75", function () {
                            // 29 / 2.75 => 10.5455 => 10.5
                            expect(numberToOneDecimalDigit(29 / 2.75)).to.equal(10.5);
                        });
                    });
                });

                describe("Hero Rounding", function () {
                    describe("roundFavorPlayerAwayFromZero", function () {
                        it("should round -1.5 to -2", function () {
                            expect(roundFavorPlayerAwayFromZero(-1.5)).to.equal(-2);
                        });

                        it("should round -0.5 to -1", function () {
                            expect(roundFavorPlayerAwayFromZero(-0.5)).to.equal(-1);
                        });

                        it("should round 0.0 to 0", function () {
                            expect(roundFavorPlayerAwayFromZero(0.0)).to.equal(0);
                        });

                        it("should round 0.01 to 0", function () {
                            expect(roundFavorPlayerAwayFromZero(0.01)).to.equal(0);
                        });

                        it("should round 0.499 to 0", function () {
                            expect(roundFavorPlayerAwayFromZero(0.499)).to.equal(0);
                        });

                        it("should round 0.5 to 1", function () {
                            expect(roundFavorPlayerAwayFromZero(0.5)).to.equal(1);
                        });

                        it("should round 0.501 to 1", function () {
                            expect(roundFavorPlayerAwayFromZero(0.501)).to.equal(1);
                        });

                        it("should round 0.599 to 1", function () {
                            expect(roundFavorPlayerAwayFromZero(0.599)).to.equal(1);
                        });

                        it("should round 0.999 to 1", function () {
                            expect(roundFavorPlayerAwayFromZero(0.999)).to.equal(1);
                        });

                        it("should round 1.5 to 2", function () {
                            expect(roundFavorPlayerAwayFromZero(1.5)).to.equal(2);
                        });

                        it("should round 10000000.5 to 10000001", function () {
                            expect(roundFavorPlayerAwayFromZero(10000000.5)).to.equal(10000001);
                        });

                        it("should round 10000001.5 to 10000002", function () {
                            expect(roundFavorPlayerAwayFromZero(10000001.5)).to.equal(10000002);
                        });
                    });

                    describe("roundFavorPlayerTowardsZero", function () {
                        it("should round -1.5 to -1", function () {
                            expect(roundFavorPlayerTowardsZero(-1.5)).to.equal(-1);
                        });

                        it("should round -0.5 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(-0.5)).to.equal(0);
                        });

                        it("should round 0.0 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.0)).to.equal(0);
                        });

                        it("should round 0.01 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.01)).to.equal(0);
                        });

                        it("should round 0.499 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.499)).to.equal(0);
                        });

                        it("should round 0.5 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.5)).to.equal(0);
                        });

                        it("should round 0.501 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.501)).to.equal(0);
                        });

                        it("should round 0.599 to 0", function () {
                            expect(roundFavorPlayerTowardsZero(0.599)).to.equal(0);
                        });

                        it("should round 0.999 to 1", function () {
                            expect(roundFavorPlayerTowardsZero(0.999)).to.equal(1);
                        });

                        it("should round 1.5 to 1", function () {
                            expect(roundFavorPlayerTowardsZero(1.5)).to.equal(1);
                        });

                        it("should round 10000000.5 to 10000000", function () {
                            expect(roundFavorPlayerTowardsZero(10000000.5)).to.equal(10000000);
                        });

                        it("should round 10000001.5 to 10000001", function () {
                            expect(roundFavorPlayerTowardsZero(10000001.5)).to.equal(10000001);
                        });
                    });
                });
            });
        },
        { displayName: "HERO: Math Functionality" },
    );
}
