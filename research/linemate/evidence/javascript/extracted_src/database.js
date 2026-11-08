// IndexedDBWrapper constructor function
class IndexedDBWrapper {
    constructor(dbName, version, storeName) {
        this.dbName = dbName;
        this.version = version;
        this.storeName = storeName;
        this.db = null;
    }
    // Open the database
    // TODO: look into index
    openDatabase() {
        // TODO: look into testing the code below not to open a connection every time
        // https://stackoverflow.com/questions/40593260/should-i-open-an-idbdatabase-each-time-or-keep-one-instance-open
        // if (this.db !== null) {
        //     return new Promise((resolve, _reject) => {
        //         resolve(this.db);
        //     })
        // }
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    // https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/createObjectStore
                    // This is to use key generator with key path
                    // db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
                    // This is to use out-of-line key
                    db.createObjectStore(this.storeName)
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    // Add data to the database
    addData(data, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const objectStore = transaction.objectStore(this.storeName);
            // Using put as opposed to add to allow for object updates
            const request = objectStore.put(data, key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
    // Get data from the database by ID
    getDataById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readonly");
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(id);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
}

export default IndexedDBWrapper;


// Example usage:
/**
    const wrapper = new IndexedDBWrapper("SampleDatabase", 1, "people");

    wrapper.openDatabase()
        .then(() => {
            const person = { name: "John Doe", email: "john@example.com" };
            return wrapper.addData(person);
        })
        .then((id) => {
            console.log("Data added with ID:", id);

            // Retrieve data by ID
            return wrapper.getDataById(id);
        })
        .then((result) => {
            console.log("Retrieved data:", result);
        })
        .catch((error) => {
            console.error("Error:", error);
        });
*/
