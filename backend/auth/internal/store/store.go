package store

type User struct {
	ID          string `json:"id"`
	Provider    string `json:"provider"`
	Sub         string `json:"sub"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	CreatedAt   string `json:"createdAt"`
	LastLoginAt string `json:"lastLoginAt"`
}

type UserStore interface {
	Find(id string) (*User, error)
	Save(user *User) error
}
