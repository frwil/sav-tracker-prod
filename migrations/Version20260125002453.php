<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260125002453 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE ticket (id INT AUTO_INCREMENT NOT NULL, category VARCHAR(50) NOT NULL, priority VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL, description LONGTEXT NOT NULL, details JSON DEFAULT NULL, created_at DATETIME NOT NULL, flock_id INT DEFAULT NULL, visit_id INT DEFAULT NULL, INDEX IDX_97A0ADA36DA78CF6 (flock_id), INDEX IDX_97A0ADA375FA0FF2 (visit_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE ticket ADD CONSTRAINT FK_97A0ADA36DA78CF6 FOREIGN KEY (flock_id) REFERENCES flock (id)');
        $this->addSql('ALTER TABLE ticket ADD CONSTRAINT FK_97A0ADA375FA0FF2 FOREIGN KEY (visit_id) REFERENCES visit (id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE ticket DROP FOREIGN KEY FK_97A0ADA36DA78CF6');
        $this->addSql('ALTER TABLE ticket DROP FOREIGN KEY FK_97A0ADA375FA0FF2');
        $this->addSql('DROP TABLE ticket');
    }
}
